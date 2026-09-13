import Foundation
import FirebaseAuth
import FirebaseFirestore
import FirebaseFunctions

/// Read-only guest links for one book (decision 41): created and revoked through Functions,
/// listed live from Firestore, opened at `<web origin>/g/<token>` with no app and no account.
@MainActor
final class ShareLinks: ObservableObject {
    struct Link: Identifiable, Equatable {
        let id: String
        let label: String
        let createdAt: Date

        var url: URL? { CloudConfiguration.webURL?.appendingPathComponent("g").appendingPathComponent(id) }
    }

    @Published private(set) var links: [Link] = []
    @Published private(set) var busy = false
    @Published var error: String?
    private var listener: ListenerRegistration?

    static var available: Bool {
        CloudConfiguration.available && CloudConfiguration.webURL != nil && Auth.auth().currentUser?.isAnonymous == false
    }

    func watch(bookId: String) {
        stop()
        guard Self.available, let uid = Auth.auth().currentUser?.uid else { return }
        listener = Firestore.firestore().collection("shares")
            .whereField("ownerId", isEqualTo: uid).whereField("bookId", isEqualTo: bookId)
            .addSnapshotListener { [weak self] snapshot, _ in
                Task { @MainActor in
                    guard let self, let snapshot else { return }
                    self.links = snapshot.documents.compactMap { doc in
                        let data = doc.data()
                        guard data["revokedAt"] == nil || data["revokedAt"] is NSNull else { return nil }
                        return Link(id: doc.documentID, label: data["label"] as? String ?? "",
                                    createdAt: (data["createdAt"] as? Timestamp)?.dateValue() ?? .distantPast)
                    }.sorted { $0.createdAt > $1.createdAt }
                }
            }
    }

    func stop() {
        listener?.remove()
        listener = nil
    }

    /// One link per recipient, so any one of them can be stopped later without the others.
    func create(bookId: String, label: String) async throws -> URL {
        guard Self.available, let base = CloudConfiguration.webURL else { throw SyncError.notConfigured }
        busy = true
        defer { busy = false }
        let response = try await Functions.functions(region: "asia-northeast1").httpsCallable("shareCreate")
            .call(["bookId": bookId, "label": label])
        guard let data = response.data as? [String: Any], let token = data["token"] as? String,
              token.range(of: "^[A-Za-z0-9_-]{32}$", options: .regularExpression) != nil else { throw SyncError.invalidResponse }
        return base.appendingPathComponent("g").appendingPathComponent(token)
    }

    func revoke(_ link: Link) async {
        guard Self.available else { return }
        busy = true
        defer { busy = false }
        do { _ = try await Functions.functions(region: "asia-northeast1").httpsCallable("shareRevoke").call(["token": link.id]) }
        catch { self.error = Localized.s("share.linkFailed") }
    }
}
