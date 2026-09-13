import Foundation
import Combine
import EhonCore

/// Local files are authoritative. This durable journal records ownership and the last
/// acknowledged document, so offline edits survive both process death and account changes.
@MainActor
final class BookRepository: ObservableObject {
    static let shared = BookRepository()
    struct Record: Codable {
        var owner: String?
        var baseline: String?
        var revision = 0
        var deleted = false
        var deleteAcknowledged = false
    }
    @Published private(set) var books: [Book] = []
    @Published private(set) var isReadOnly = false
    @Published private(set) var hasPendingChanges = false
    @Published private(set) var syncError: String?
    @Published private(set) var entitlement: [String: Any] = [:]
    var liveBook: ((String) -> Book?)?
    var isGestureActive: (() -> Bool)?
    var onRemote: ((Book) -> Void)?
    var onIdentityChange: (() -> Void)?
    private let store: LocalBookStore
    private let journalURL: URL
    private var records: [String: Record]
    private var engine: SyncEngine?
    private var accountWatch: AnyCancellable?
    private var owner: String?
    private var openId: String?
    private var editing = false
    private var pendingRemote: [String: (Book, Int)] = [:]
    private var voiceTasks: [String: Task<Void, Never>] = [:]
    private var journalHealthy = true

    init(store: LocalBookStore = .shared, engine: SyncEngine? = nil, connect: Bool = true) {
        self.store = store
        journalURL = store.directory.appendingPathComponent("sync-state.json")
        if FileManager.default.fileExists(atPath: journalURL.path) {
            do { records = try JSONDecoder().decode([String: Record].self, from: Data(contentsOf: journalURL)) }
            catch { records = [:]; journalHealthy = false }
        } else { records = [:] }
        reload()
        self.engine = engine ?? (connect && CloudConfiguration.available ? SyncEngine() : nil)
        self.engine?.onRemote = { [weak self] book, revision in self?.receive(book, revision: revision) }
        self.engine?.onAcknowledged = { [weak self] push, revision in self?.acknowledge(push, revision: revision) }
        self.engine?.onDeleted = { [weak self] id, revision in self?.remoteDelete(id, revision: revision) }
        self.engine?.onError = { [weak self] error in self?.syncError = error }
        self.engine?.onLease = { [weak self] readOnly in self?.isReadOnly = readOnly }
        self.engine?.onEntitlement = { [weak self] fields in self?.entitlement = fields }
        if connect, CloudConfiguration.available {
            accountWatch = Publishers.CombineLatest(AccountSession.shared.$uid, AccountSession.shared.$isSignedIn)
                .receive(on: RunLoop.main).sink { [weak self] uid, signedIn in self?.changeOwner(signedIn ? uid : nil) }
        }
    }

    func reload() {
        books = store.loadAll().filter { book in
            let record = records[book.id.value]
            return record?.deleted != true && (record?.owner == nil || record?.owner == owner)
        }
        hasPendingChanges = books.contains { book in
            let record = records[book.id.value]
            return owner != nil && record?.baseline != BookCodec.shared.encode(book: book)
        } || records.values.contains { $0.owner == owner && $0.deleted && !$0.deleteAcknowledged }
    }

    @discardableResult func save(_ book: Book) -> Bool {
        let id = book.id.value
        guard records[id]?.deleted != true,
              records[id]?.owner == nil || records[id]?.owner == owner else { return false }
        guard store.save(book) else { syncError = Localized.s("sync.diskError"); return false }
        if records[id] == nil { records[id] = Record(owner: owner) }
        persist(); reload(); prepareUpload(book)
        AssetLoader.shared.prefetch(book)
        return true
    }

    func delete(_ book: Book) {
        let id = book.id.value
        guard records[id]?.owner == nil || records[id]?.owner == owner else { return }
        if records[id]?.owner != nil {
            records[id]?.deleted = true; records[id]?.deleteAcknowledged = false
            persist(); enqueue(book)
        } else { store.delete(book.id); records[id] = nil; persist() }
        reload()
    }

    func open(_ book: Book, editing: Bool) {
        openId = book.id.value; self.editing = editing
        engine?.open(book.id.value, editing: editing)
        AssetLoader.shared.prefetch(book)
        for index in 0..<Int(book.pageCount) {
            if let ref = book.page(index: Int32(index)).reply?.audioRef, ref.hasPrefix("v/") {
                Task { _ = try? await CloudAssets.shared.voiceURL(ref) }
            }
        }
    }

    func close() { engine?.close(); openId = nil; editing = false; flushRemote() }
    func saveOpenBook() { if let openId, let book = liveBook?(openId) { save(book) } }
    func setForeground(_ value: Bool) { engine?.setForeground(value); if value { books.forEach(prepareUpload) } }

    func flushRemote() {
        guard isGestureActive?() != true else { return }
        let waiting = pendingRemote; pendingRemote.removeAll()
        for (_, (book, revision)) in waiting { receive(book, revision: revision) }
    }

    func changeOwner(_ next: String?) {
        guard next != owner else { return }
        // Capture the old editor before changing ownership or detaching its sync writer.
        if let openId, let current = liveBook?(openId) { _ = save(current) }
        engine?.stop(); voiceTasks.values.forEach { $0.cancel() }; voiceTasks.removeAll()
        pendingRemote.removeAll(); owner = next; entitlement = [:]; syncError = nil
        onIdentityChange?()
        openId = nil; editing = false
        if let next {
            // Only unclaimed local drafts are migrated. Previously owned files keep their UID.
            for book in store.loadAll() where journalHealthy && records[book.id.value]?.owner == nil {
                records[book.id.value] = Record(owner: next)
            }
            PartRegistry.shared.selectOwner(next)
            engine?.start(uid: next)
        } else { PartRegistry.shared.selectOwner(nil) }
        persist(); reload()
        if next != nil {
            store.loadAll().filter { records[$0.id.value]?.owner == next }.forEach(prepareUpload)
        }
    }

    private func receive(_ remote: Book, revision: Int) {
        guard let owner else { return }
        let id = remote.id.value
        guard records[id]?.owner == nil || records[id]?.owner == owner,
              revision > (records[id]?.revision ?? 0) else { return }
        if id == openId, isGestureActive?() == true { pendingRemote[id] = (remote, revision); return }
        let record = records[id] ?? Record(owner: owner)
        let baseline = record.baseline.flatMap { BookCodec.shared.decodeOrNull(text: $0) }
        let local = liveBook?(id) ?? books.first { $0.id.value == id }
        let merged = local.map { BookSyncCodec.shared.merge(local: $0, baseline: baseline, remote: remote) } ?? remote
        guard store.save(merged) else { syncError = Localized.s("sync.diskError"); return }
        records[id] = Record(owner: owner, baseline: BookCodec.shared.encode(book: remote), revision: revision,
                             deleted: record.deleted, deleteAcknowledged: record.deleteAcknowledged)
        persist(); reload()
        onRemote?(merged)
        AssetLoader.shared.prefetch(merged)
        enqueue(merged)
    }

    private func acknowledge(_ push: SyncEngine.Push, revision: Int) {
        let id = push.book.id.value
        guard records[id]?.owner == owner else { return }
        if revision >= (records[id]?.revision ?? 0) {
            records[id]?.baseline = BookCodec.shared.encode(book: push.book)
            records[id]?.revision = revision
            if push.deleted { records[id]?.deleteAcknowledged = true }
        }
        syncError = nil; persist(); reload()
        if let latest = liveBook?(id) ?? store.loadAll().first(where: { $0.id.value == id }) { enqueue(latest) }
    }

    private func remoteDelete(_ id: String, revision: Int) {
        guard records[id]?.owner == owner, revision >= (records[id]?.revision ?? 0) else { return }
        records[id]?.deleted = true; records[id]?.deleteAcknowledged = true; records[id]?.revision = revision
        // Keep the file as a recoverable archive, but never resurrect a cloud tombstone.
        persist(); reload()
        if openId == id { close(); onIdentityChange?() }
    }

    private func enqueue(_ book: Book) {
        guard journalHealthy, let owner, let record = records[book.id.value], record.owner == owner else { return }
        let json = BookCodec.shared.encode(book: book)
        guard record.deleted ? !record.deleteAcknowledged : record.baseline != json else { return }
        engine?.enqueue(.init(book: book, baseline: record.baseline.flatMap { BookCodec.shared.decodeOrNull(text: $0) }, revision: record.revision, deleted: record.deleted))
    }

    private func prepareUpload(_ book: Book) {
        enqueue(book)
        guard let owner, records[book.id.value]?.owner == owner, records[book.id.value]?.deleted != true,
              voiceTasks[book.id.value] == nil else { return }
        let id = book.id.value
        voiceTasks[id] = Task { [weak self] in
            guard let self else { return }
            defer { self.voiceTasks[id] = nil }
            for index in 0..<Int(book.pageCount) {
                let page = book.page(index: Int32(index))
                guard let ref = page.reply?.audioRef, !ref.hasPrefix("v/"), !Task.isCancelled else { continue }
                do {
                    let remote = try await CloudAssets.shared.backupVoice(ref, bookId: id, pageId: page.id)
                    guard self.owner == owner, !Task.isCancelled,
                          let current = self.liveBook?(id) ?? self.books.first(where: { $0.id.value == id }) else { return }
                    let updated = BookSyncCodec.shared.replaceVoiceReference(book: current, pageId: page.id, expected: ref, replacement: remote)
                    if updated != current { _ = self.save(updated); self.onRemote?(updated) }
                } catch { self.syncError = error.localizedDescription }
            }
        }
    }

    private func persist() {
        guard journalHealthy else { syncError = Localized.s("sync.diskError"); return }
        do { try JSONEncoder().encode(records).write(to: journalURL, options: .atomic) }
        catch { journalHealthy = false; syncError = Localized.s("sync.diskError") }
    }
}
