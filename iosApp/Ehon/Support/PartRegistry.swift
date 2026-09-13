import Foundation
import FirebaseFirestore
import EhonCore

/// Local resolver used by every scene builder, including offline exports.
final class PartRegistry: PartResolver, @unchecked Sendable {
    static let shared = PartRegistry()
    private let lock = NSLock()
    private var refs: [String: String] = [:]
    private var owner: String?
    private let directory: URL

    init(directory: URL? = nil) {
        self.directory = directory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("PartRegistry", isDirectory: true)
        try? FileManager.default.createDirectory(at: self.directory, withIntermediateDirectories: true)
    }

    func find(id: PartId) -> Part? {
        if let builtIn = PartCatalog.shared.find(id: id) { return builtIn }
        lock.lock(); let ref = refs[id.value]; lock.unlock()
        guard let ref = ref ?? (id.value.hasPrefix("lib:") ? "missing:\(id.value)" : nil) else { return nil }
        return Part(id: id, nameKey: id.value, category: "library", def: PartDefRaster(assetRef: ref))
    }

    func selectOwner(_ uid: String?) {
        let cached = uid.flatMap { try? Data(contentsOf: file($0)) }
            .flatMap { try? JSONDecoder().decode([String: String].self, from: $0) } ?? [:]
        lock.lock(); owner = uid; refs = cached; lock.unlock()
        changed()
    }

    func update(uid: String, illustrations: [(String, [String: Any])]) {
        lock.lock()
        guard owner == uid else { lock.unlock(); return }
        for (id, fields) in illustrations {
            if let ref = fields["masterRef"] as? String, AssetLoader.validRef(ref) { refs["lib:\(id)"] = ref }
        }
        let snapshot = refs
        lock.unlock()
        if let data = try? JSONEncoder().encode(snapshot) { try? data.write(to: file(uid), options: .atomic) }
        changed()
    }

    @MainActor func ensure(_ book: Book) async {
        guard CloudConfiguration.available, let uid = AccountSession.shared.uid, AccountSession.shared.isSignedIn else { return }
        let ids = Set((0..<Int(book.pageCount)).flatMap { book.page(index: Int32($0)).items.compactMap { ($0 as? PartItem)?.partId.value } })
        for id in ids where id.hasPrefix("lib:") && ((find(id: PartId(value: id))?.def as? PartDefRaster)?.assetRef.hasPrefix("missing:") ?? true) {
            let raw = String(id.dropFirst(4))
            guard raw.range(of: "^[A-Za-z0-9_-]{1,128}$", options: .regularExpression) != nil else { continue }
            if let doc = try? await Firestore.firestore().document("illustrations/\(raw)").getDocument(), let data = doc.data() {
                update(uid: uid, illustrations: [(raw, data)])
            }
        }
    }

    private func file(_ uid: String) -> URL { directory.appendingPathComponent("\(SyncEngine.hash(uid)).json") }
    private func changed() { DispatchQueue.main.async { NotificationCenter.default.post(name: .ehonAssetsChanged, object: nil) } }
}

extension Notification.Name { static let ehonAssetsChanged = Notification.Name("ehonAssetsChanged") }
