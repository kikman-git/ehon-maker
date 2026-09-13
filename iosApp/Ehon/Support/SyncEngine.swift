import Foundation
import FirebaseFirestore
import EhonCore

/// Firebase transport only. Kotlin owns document assembly/merge; BookRepository owns files.
@MainActor
final class SyncEngine {
    struct Push {
        let book: Book
        let baseline: Book?
        let revision: Int
        let deleted: Bool
    }
    private struct Metadata {
        let json: String
        let ids: [String]
        let hashes: [String: String]
        let revision: Int
        let lease: [String: Any]?
    }

    var onRemote: ((Book, Int) -> Void)?
    var onAcknowledged: ((Push, Int) -> Void)?
    var onDeleted: ((String, Int) -> Void)?
    var onError: ((String) -> Void)?
    var onLease: ((Bool) -> Void)?
    var onEntitlement: (([String: Any]) -> Void)?
    private let db: Firestore
    private(set) var uid: String?
    private var epoch = UUID()
    private let deviceId: String
    private var shelf: ListenerRegistration?
    private var pagesListener: ListenerRegistration?
    private var library: ListenerRegistration?
    private var entitlement: ListenerRegistration?
    private var heartbeat: Task<Void, Never>?
    private var metadata: [String: Metadata] = [:]
    private var pages: [String: [String: String]] = [:]
    private var fetching: Set<String> = []
    private var queued: [String: Push] = [:]
    private var writers: [String: Task<Void, Never>] = [:]
    private var leaseWaiters: [String: Task<Void, Never>] = [:]
    private var opened: String?
    private var editing = false
    private var foreground = true
    private(set) var activePageListeners = 0

    init(db: Firestore = Firestore.firestore(), deviceId: String? = nil) {
        self.db = db
        let saved = UserDefaults.standard.string(forKey: "syncDeviceId") ?? UUID().uuidString
        UserDefaults.standard.set(saved, forKey: "syncDeviceId")
        self.deviceId = deviceId ?? saved
    }

    func start(uid: String) {
        stop()
        self.uid = uid
        let generation = epoch
        shelf = db.collection("books").whereField("ownerId", isEqualTo: uid).whereField("deleted", isEqualTo: false)
            .addSnapshotListener(includeMetadataChanges: true) { [weak self] snapshot, error in
                Task { @MainActor in
                    guard let self, self.epoch == generation else { return }
                    if let error { self.onError?(error.localizedDescription); return }
                    for change in snapshot?.documentChanges(includeMetadataChanges: true) ?? [] {
                        let doc = change.document
                        guard !doc.metadata.hasPendingWrites else { continue }
                        if change.type == .removed { self.fetchDeleted(doc.documentID, generation: generation) }
                        else { self.receiveMetadata(doc.documentID, data: doc.data()) }
                    }
                }
            }
        entitlement = db.document("entitlements/\(uid)").addSnapshotListener { [weak self] snapshot, _ in
            Task { @MainActor in
                guard let self, self.epoch == generation else { return }
                self.onEntitlement?(snapshot?.data() ?? [:])
            }
        }
        library = db.collection("illustrations").whereField("ownerId", isEqualTo: uid).whereField("deleted", isEqualTo: false)
            .addSnapshotListener { [weak self] snapshot, _ in
                Task { @MainActor in
                    guard let self, self.epoch == generation, let snapshot else { return }
                    PartRegistry.shared.update(uid: uid, illustrations: snapshot.documents.map { ($0.documentID, $0.data()) })
                }
            }
    }

    func stop() {
        close()
        epoch = UUID()
        shelf?.remove(); shelf = nil
        library?.remove(); library = nil
        entitlement?.remove(); entitlement = nil
        for task in writers.values { task.cancel() }
        for task in leaseWaiters.values { task.cancel() }
        leaseWaiters.removeAll()
        writers.removeAll(); queued.removeAll(); metadata.removeAll(); pages.removeAll(); fetching.removeAll()
        uid = nil
    }

    func enqueue(_ push: Push) {
        guard uid != nil else { return }
        let id = push.book.id.value
        guard Self.validID(id) else { onError?(Localized.s("sync.invalidId")); return }
        queued[id] = push
        startWriter(id)
    }

    private func startWriter(_ id: String) {
        guard writers[id] == nil, let uid else { return }
        if heldElsewhere(id) { scheduleLeaseRetry(id); return }
        let generation = epoch
        writers[id] = Task { [weak self] in
            guard let self else { return }
            var failures = 0
            defer { if self.epoch == generation { self.writers[id] = nil } }
            while !Task.isCancelled, self.epoch == generation, let push = self.queued.removeValue(forKey: id) {
                if self.heldElsewhere(id) { self.queued[id] = push; self.scheduleLeaseRetry(id); break }
                do {
                    try await self.commit(push, uid: uid)
                    guard self.epoch == generation else { return }
                    failures = 0
                    self.queued[id] = nil
                    self.onAcknowledged?(push, push.revision + 1)
                    if self.opened == id && self.editing { await self.acquireLease(id, generation: generation) }
                } catch {
                    guard self.epoch == generation, !Task.isCancelled else { return }
                    failures += 1
                    // A stale revision rejects the entire batch. Pull the latest baseline,
                    // merge clean pages, then retry the coalesced local document.
                    self.queued[id] = self.queued[id] ?? push
                    await self.refresh(id, generation: generation)
                    self.onError?(error.localizedDescription)
                    if case SyncError.documentTooLarge = error { break }
                    try? await Task.sleep(for: .seconds(min(60, pow(2, Double(min(failures, 6))))))
                }
            }
        }
    }

    private func commit(_ push: Push, uid: String) async throws {
        let book = push.book
        let ref = db.document("books/\(book.id.value)")
        let encoded = Dictionary(uniqueKeysWithValues: (0..<Int(book.pageCount)).map { index in
            let page = book.page(index: Int32(index)); return (page.id, BookCodec.shared.encodePage(page: page))
        })
        let ids = (0..<Int(book.pageCount)).map { book.page(index: Int32($0)).id }
        let hashes = encoded.mapValues { Self.hash($0) }
        let meta = BookSyncCodec.shared.metadata(book: book)
        guard ids.count <= 200, meta.utf8.count < 100_000, encoded.values.allSatisfy({ $0.utf8.count < 900_000 }) else {
            throw SyncError.documentTooLarge
        }
        var fields: [String: Any] = ["ownerId": uid, "meta": meta, "pageIds": ids, "pageHashes": hashes,
                                      "revision": push.revision + 1, "updatedAt": FieldValue.serverTimestamp(), "deleted": push.deleted]
        let batch = db.batch()
        if push.revision == 0 { fields["lease"] = NSNull(); batch.setData(fields, forDocument: ref) }
        else { batch.updateData(fields, forDocument: ref) }
        if !push.deleted {
            var previous: [String: String] = [:]
            if let baseline = push.baseline {
                for index in 0..<Int(baseline.pageCount) {
                    let page = baseline.page(index: Int32(index)); previous[page.id] = Self.hash(BookCodec.shared.encodePage(page: page))
                }
            }
            for (id, json) in encoded where previous[id] != hashes[id] {
                batch.setData(["ownerId": uid, "json": json, "updatedAt": FieldValue.serverTimestamp()], forDocument: ref.collection("pages").document(id))
            }
        }
        try await batch.commit()
    }

    func open(_ id: String, editing: Bool) {
        if opened == id && self.editing == editing { return }
        close()
        guard uid != nil, Self.validID(id) else { return }
        opened = id; self.editing = editing
        let generation = epoch
        activePageListeners += 1
        assert(activePageListeners == 1)
        pagesListener = db.document("books/\(id)").collection("pages").addSnapshotListener(includeMetadataChanges: true) { [weak self] snapshot, _ in
            Task { @MainActor in
                guard let self, self.epoch == generation, self.opened == id,
                      let snapshot, !snapshot.metadata.hasPendingWrites else { return }
                self.pages[id] = Self.pageJSON(snapshot)
                self.deliver(id)
            }
        }
        if editing && foreground { startHeartbeat(id, generation: generation) }
    }

    func close() {
        let old = opened
        opened = nil
        pagesListener?.remove(); pagesListener = nil; activePageListeners = 0
        heartbeat?.cancel(); heartbeat = nil
        if let old, editing { releaseLease(old) }
        editing = false
        onLease?(false)
    }

    func setForeground(_ value: Bool) {
        foreground = value
        guard let opened, editing else { return }
        heartbeat?.cancel(); heartbeat = nil
        if value { startHeartbeat(opened, generation: epoch) }
        else { releaseLease(opened) }
    }

    private func startHeartbeat(_ id: String, generation: UUID) {
        heartbeat = Task { [weak self] in
            while !Task.isCancelled {
                guard let self, self.epoch == generation, self.opened == id, self.foreground else { return }
                await self.acquireLease(id, generation: generation)
                try? await Task.sleep(for: .seconds(60))
            }
        }
    }

    private func acquireLease(_ id: String, generation: UUID) async {
        guard let uid else { return }
        let device = deviceId; let ref = db.document("books/\(id)")
        do {
            let result = try await db.runTransaction { transaction, errorPointer -> Any? in
                do {
                    let doc = try transaction.getDocument(ref)
                    guard doc.exists else { return true }
                    let data = doc.data() ?? [:]
                    guard data["ownerId"] as? String == uid, data["deleted"] as? Bool == false else { return false }
                    if let lease = data["lease"] as? [String: Any], lease["deviceId"] as? String != device,
                       let expiry = lease["expiresAt"] as? Timestamp, expiry.dateValue() > Date() { return false }
                    transaction.updateData(["lease": ["deviceId": device, "expiresAt": Timestamp(date: Date().addingTimeInterval(175))]], forDocument: ref)
                    return true
                } catch { errorPointer?.pointee = error as NSError; return nil }
            }
            guard epoch == generation, opened == id, editing, foreground else {
                if epoch == generation { releaseLease(id) }; return
            }
            onLease?(!(result as? Bool ?? false))
            if result as? Bool == true { startWriter(id) }
        } catch {
            // Offline creation and editing remain available. A known live lease still wins.
            if epoch == generation, opened == id { onLease?(heldElsewhere(id)) }
        }
    }

    private func releaseLease(_ id: String) {
        let ref = db.document("books/\(id)"); let device = deviceId
        Task {
            _ = try? await db.runTransaction { transaction, errorPointer -> Any? in
                do {
                    let doc = try transaction.getDocument(ref)
                    if (doc.data()?["lease"] as? [String: Any])?["deviceId"] as? String == device {
                        transaction.updateData(["lease": NSNull()], forDocument: ref)
                    }
                } catch { errorPointer?.pointee = error as NSError }
                return nil
            }
        }
    }

    private func heldElsewhere(_ id: String) -> Bool {
        guard let lease = metadata[id]?.lease, lease["deviceId"] as? String != deviceId,
              let expiry = lease["expiresAt"] as? Timestamp else { return false }
        return expiry.dateValue() > Date()
    }

    private func scheduleLeaseRetry(_ id: String) {
        guard leaseWaiters[id] == nil, queued[id] != nil else { return }
        let generation = epoch
        let expires = (metadata[id]?.lease?["expiresAt"] as? Timestamp)?.dateValue() ?? Date()
        leaseWaiters[id] = Task {
            try? await Task.sleep(for: .seconds(max(1, min(180, expires.timeIntervalSinceNow + 1))))
            guard !Task.isCancelled, epoch == generation else { return }
            leaseWaiters[id] = nil
            startWriter(id)
        }
    }

    private func receiveMetadata(_ id: String, data: [String: Any]) {
        guard data["ownerId"] as? String == uid,
              let revision = data["revision"] as? Int, revision >= (metadata[id]?.revision ?? 0),
              let json = data["meta"] as? String, let ids = data["pageIds"] as? [String],
              let hashes = data["pageHashes"] as? [String: String], Set(ids).count == ids.count,
              Set(ids) == Set(hashes.keys), ids.count <= 200 else { return }
        metadata[id] = Metadata(json: json, ids: ids, hashes: hashes, revision: revision, lease: data["lease"] as? [String: Any])
        if opened == id && editing { onLease?(heldElsewhere(id)) }
        if !heldElsewhere(id) { startWriter(id) }
        if !deliver(id), opened != id || pages[id] == nil { fetchPages(id) }
    }

    @discardableResult private func deliver(_ id: String) -> Bool {
        guard let meta = metadata[id], let cached = pages[id],
              meta.ids.allSatisfy({ cached[$0].map(Self.hash) == meta.hashes[$0] }),
              let book = BookSyncCodec.shared.assembleOrNull(metadata: meta.json, pages: meta.ids.compactMap { cached[$0] }),
              book.id.value == id,
              (0..<Int(book.pageCount)).map({ book.page(index: Int32($0)).id }) == meta.ids else { return false }
        onRemote?(book, meta.revision)
        return true
    }

    private func fetchPages(_ id: String) {
        guard !fetching.contains(id) else { return }
        fetching.insert(id); let generation = epoch
        let requestedRevision = metadata[id]?.revision
        Task {
            let snapshot = try? await db.document("books/\(id)").collection("pages").getDocuments()
            guard epoch == generation else { return }
            fetching.remove(id)
            if let snapshot, !snapshot.metadata.hasPendingWrites {
                pages[id] = Self.pageJSON(snapshot)
                if !deliver(id), requestedRevision != metadata[id]?.revision { fetchPages(id) }
            }
        }
    }

    private func refresh(_ id: String, generation: UUID) async {
        do {
            let doc = try await db.document("books/\(id)").getDocument(source: .server)
            guard epoch == generation, let data = doc.data() else { return }
            if data["deleted"] as? Bool == true {
                queued[id] = nil; onDeleted?(id, data["revision"] as? Int ?? 0); return
            }
            let snapshot = try await doc.reference.collection("pages").getDocuments(source: .server)
            guard epoch == generation, !snapshot.metadata.hasPendingWrites else { return }
            pages[id] = Self.pageJSON(snapshot); receiveMetadata(id, data: data)
        } catch { /* The durable local queue retries when connectivity returns. */ }
    }

    private func fetchDeleted(_ id: String, generation: UUID) { Task { await refresh(id, generation: generation) } }
    private static func pageJSON(_ snapshot: QuerySnapshot) -> [String: String] {
        Dictionary(uniqueKeysWithValues: snapshot.documents.compactMap { doc in (doc.data()["json"] as? String).map { (doc.documentID, $0) } })
    }
    nonisolated static func hash(_ json: String) -> String { AccountSession.hash(Data(json.utf8)) }
    nonisolated private static func validID(_ id: String) -> Bool { id.range(of: "^[A-Za-z0-9_-]{1,128}$", options: .regularExpression) != nil }
}

enum SyncError: Error { case documentTooLarge, invalidResponse, notConfigured, invalidAsset }
