import XCTest
import FirebaseCore
import FirebaseAuth
import FirebaseFirestore
import FirebaseAppCheck
import EhonCore
@testable import Ehon

@MainActor
final class SyncIntegrationTests: XCTestCase {
    private var peers: [Peer] = []
    override func setUp() async throws {
        guard ProcessInfo.processInfo.environment["EHON_SYNC_TESTS"] == "1" else { throw XCTSkip("Run make sync-test for emulator integration tests.") }
        AppCheck.setAppCheckProviderFactory(EmulatorAppCheckFactory())
        let subject = "test-\(UUID().uuidString)"
        peers = [try await Peer.make(subject: subject), try await Peer.make(subject: subject)]
        XCTAssertEqual(peers[0].uid, peers[1].uid)
    }
    override func tearDown() async throws {
        for peer in peers { peer.engine.stop(); try await peer.db.terminate(); try await peer.app.delete(); try? FileManager.default.removeItem(at: peer.folder) }
        peers = []
    }

    func testConvergenceCoalescingAndOfflineDisjointEdits() async throws {
        let a = peers[0], b = peers[1]
        let book = sampleBook("b-\(UUID().uuidString)")
        a.repo.save(book)
        try await until { b.repo.books.contains { $0.id == book.id } && !a.repo.hasPendingChanges }
        a.repo.open(a.repo.books.first!, editing: false); b.repo.open(b.repo.books.first!, editing: false)
        XCTAssertEqual(a.engine.activePageListeners, 1)
        try await a.db.disableNetwork()
        let local = edit(a.repo.books.first!, page: 0, text: "Offline A")
        a.repo.save(local)
        let other = edit(b.repo.books.first!, page: 1, text: "Online B")
        b.repo.save(other)
        try await until { !b.repo.hasPendingChanges }
        try await a.db.enableNetwork()
        try await until(seconds: 15) {
            guard let x = a.repo.books.first, let y = b.repo.books.first else { return false }
            return !a.repo.hasPendingChanges && !b.repo.hasPendingChanges && BookCodec.shared.encode(book: x) == BookCodec.shared.encode(book: y)
                && self.hasText(x, "Offline A", page: 0) && self.hasText(x, "Online B", page: 1)
        }
        for n in 0..<8 { a.repo.save(edit(a.repo.books.first!, page: 0, text: "coalesced-\(n)")) }
        try await until { !a.repo.hasPendingChanges && b.repo.books.first.map { self.hasText($0, "coalesced-7", page: 0) } == true }
        a.repo.close(); b.repo.close()
        XCTAssertEqual(a.engine.activePageListeners, 0)
        XCTAssertEqual(b.engine.activePageListeners, 0)
    }

    func testLeaseMakesSecondEditorReadOnlyAndReleasesOnClose() async throws {
        let a = peers[0], b = peers[1]
        let book = sampleBook("b-\(UUID().uuidString)")
        a.repo.save(book)
        try await until { !a.repo.hasPendingChanges && !b.repo.books.isEmpty }
        a.repo.open(book, editing: true)
        let ref = a.db.document("books/\(book.id.value)")
        try await untilAsync { (try? await ref.getDocument().data()?["lease"] as? [String: Any])?["deviceId"] as? String == a.device }
        b.repo.open(b.repo.books.first!, editing: true)
        try await until { b.repo.isReadOnly }
        XCTAssertFalse(a.repo.isReadOnly)
        b.repo.close()
        let held = try await ref.getDocument().data()?["lease"] as? [String: Any]
        XCTAssertEqual(held?["deviceId"] as? String, a.device)
        a.repo.close()
        try await untilAsync { (try? await ref.getDocument().data()?["lease"]) is NSNull }
    }

    private func edit(_ book: Book, page: Int, text: String) -> Book {
        let editor = EditorController(initial: book, measurer: UIKitTextMeasurer(), idSource: IdSource(prefix: UUID().uuidString), clock: { KotlinLong(value: Int64(Date().timeIntervalSince1970 * 1000)) })
        editor.goToPage(index: Int32(page)); editor.setMode(next: .text); editor.setDraftText(value: text); editor.commitText()
        return editor.book
    }
    private func hasText(_ book: Book, _ text: String, page: Int) -> Bool { book.page(index: Int32(page)).items.contains { ($0 as? TextItem)?.text == text } }
    private func until(seconds: Double = 5, _ condition: () -> Bool) async throws {
        try await untilAsync(seconds: seconds) { condition() }
    }
    private func untilAsync(seconds: Double = 5, _ condition: () async -> Bool) async throws {
        let deadline = Date().addingTimeInterval(seconds)
        while Date() < deadline { if await condition() { return }; try await Task.sleep(for: .milliseconds(50)) }
        XCTFail("Sync did not converge within \(seconds)s"); throw URLError(.timedOut)
    }
}

@MainActor
private final class Peer {
    let app: FirebaseApp; let db: Firestore; let uid: String; let folder: URL; let device: String
    let engine: SyncEngine; let repo: BookRepository
    init(app: FirebaseApp, db: Firestore, uid: String) {
        self.app = app; self.db = db; self.uid = uid
        device = UUID().uuidString
        folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        engine = SyncEngine(db: db, deviceId: device)
        repo = BookRepository(store: LocalBookStore(directory: folder), engine: engine, connect: false)
        repo.changeOwner(uid)
    }
    static func make(subject: String) async throws -> Peer {
        let name = UUID().uuidString
        let options = FirebaseOptions(googleAppID: "1:1234567890:ios:0123456789abcdef", gcmSenderID: "1234567890")
        options.projectID = "demo-ehon"; options.apiKey = "AIzaSyDemoEhonLocalEmulatorOnly00000000000"
        FirebaseApp.configure(name: name, options: options)
        let app = FirebaseApp.app(name: name)!
        let auth = Auth.auth(app: app); auth.useEmulator(withHost: "127.0.0.1", port: 9099)
        let token = String(data: try JSONSerialization.data(withJSONObject: ["sub": subject, "email": "\(subject)@example.invalid", "email_verified": true]), encoding: .utf8)!
        let result = try await auth.signIn(with: GoogleAuthProvider.credential(withIDToken: token, accessToken: "emulator"))
        let db = Firestore.firestore(app: app)
        let settings = db.settings; settings.host = "127.0.0.1:8080"; settings.isSSLEnabled = false; settings.cacheSettings = MemoryCacheSettings(); db.settings = settings
        return Peer(app: app, db: db, uid: result.user.uid)
    }
}
