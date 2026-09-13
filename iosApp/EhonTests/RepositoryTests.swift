import XCTest
import EhonCore
@testable import Ehon

@MainActor
final class RepositoryTests: XCTestCase {
    func testLocalDraftsMigrateOnceAndAccountsKeepSeparateShelves() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: folder) }
        let store = LocalBookStore(directory: folder)
        let draft = sampleBook("draft")
        let repo = BookRepository(store: store, connect: false)
        XCTAssertTrue(repo.save(draft))
        repo.changeOwner("alice")
        XCTAssertEqual(repo.books.count, 1)
        repo.changeOwner(nil)
        XCTAssertTrue(repo.books.isEmpty)
        repo.save(sampleBook("second-draft"))
        repo.changeOwner("bob")
        XCTAssertEqual(repo.books.map { $0.id.value }, ["second-draft"])
        repo.changeOwner("alice")
        XCTAssertEqual(repo.books.map { $0.id.value }, ["draft"])
        let restarted = BookRepository(store: store, connect: false)
        restarted.changeOwner("bob")
        XCTAssertEqual(restarted.books.map { $0.id.value }, ["second-draft"])
        XCTAssertEqual(store.loadAll().count, 2)
    }

    func testCorruptJournalCannotReassignPreviouslyOwnedFiles() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: folder) }
        let store = LocalBookStore(directory: folder); store.save(sampleBook("kept"))
        let journal = folder.appendingPathComponent("sync-state.json")
        try Data("broken".utf8).write(to: journal)
        let repo = BookRepository(store: store, connect: false)
        repo.changeOwner("another-account")
        XCTAssertNotNil(repo.syncError)
        XCTAssertEqual(try Data(contentsOf: journal), Data("broken".utf8))
        XCTAssertEqual(store.loadAll().count, 1)
    }

    func testRemoteVoiceReferencesNeverBecomePaths() {
        let parent = VoiceRecorder.url(for: "r-safe.m4a").deletingLastPathComponent()
        for ref in ["../../other.m4a", "v/alice/book/reply.m4a", "/tmp/bad.m4a"] {
            XCTAssertEqual(VoiceRecorder.url(for: ref).deletingLastPathComponent(), parent)
        }
    }
}

func sampleBook(_ id: String) -> Book {
    Templates.shared.instantiate(template: Templates.shared.find(id: "t1")!, bookId: BookId(value: id), title: "Sync test",
        contentLocale: "en-US", nowEpochMs: 1, shapeOverride: nil, idSource: IdSource(prefix: "test-"))
}
