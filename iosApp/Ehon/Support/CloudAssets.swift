import Foundation
import FirebaseAuth
import FirebaseFunctions

@MainActor
final class CloudAssets {
    static let shared = CloudAssets()

    func backupVoice(_ localRef: String, bookId: String, pageId: String) async throws -> String {
        guard CloudConfiguration.available, let user = Auth.auth().currentUser, !user.isAnonymous else { throw SyncError.notConfigured }
        let uid = user.uid
        let bytes = try Data(contentsOf: VoiceRecorder.url(for: localRef))
        guard !bytes.isEmpty, bytes.count <= 25 * 1024 * 1024 else { throw SyncError.invalidAsset }
        let hash = AccountSession.hash(bytes)
        let functions = Functions.functions(region: "asia-northeast1")
        let response = try await functions.httpsCallable("presignUpload").call([
            "kind": "voice", "mime": "audio/mp4", "bytes": bytes.count, "sha256": hash,
            "bookId": bookId, "replyId": "r-\(AccountSession.hash(Data((pageId + hash).utf8)).prefix(40))",
        ])
        guard let data = response.data as? [String: Any], let key = data["key"] as? String,
              let rawURL = data["url"] as? String, let url = URL(string: rawURL), url.scheme == "https" else { throw SyncError.invalidResponse }
        var request = URLRequest(url: url); request.httpMethod = "PUT"
        for (name, value) in data["headers"] as? [String: String] ?? [:] { request.setValue(value, forHTTPHeaderField: name) }
        let (_, uploaded) = try await URLSession.shared.upload(for: request, from: bytes)
        guard let uploaded = uploaded as? HTTPURLResponse, (200..<300).contains(uploaded.statusCode),
              Auth.auth().currentUser?.uid == uid else { throw SyncError.invalidResponse }
        let finalized = try await functions.httpsCallable("finalizeAsset").call(["key": key])
        guard let result = finalized.data as? [String: Any], let ref = result["ref"] as? String,
              ref.hasPrefix("v/\(uid)/\(bookId)/"), Auth.auth().currentUser?.uid == uid else { throw SyncError.invalidResponse }
        try bytes.write(to: VoiceRecorder.url(for: ref), options: .atomic)
        return ref
    }

    func voiceURL(_ ref: String) async throws -> URL {
        let local = VoiceRecorder.url(for: ref)
        guard ref.hasPrefix("v/") else { return local }
        guard CloudConfiguration.available, let user = Auth.auth().currentUser, !user.isAnonymous,
              ref.hasPrefix("v/\(user.uid)/") else { throw SyncError.notConfigured }
        let uid = user.uid
        if FileManager.default.fileExists(atPath: local.path) { return local }
        let response = try await Functions.functions(region: "asia-northeast1").httpsCallable("signedRead").call(["key": ref])
        guard let data = response.data as? [String: Any], let rawURL = data["url"] as? String,
              let url = URL(string: rawURL), url.scheme == "https" else { throw SyncError.invalidResponse }
        let (tmp, responseURL) = try await URLSession.shared.download(from: url)
        defer { try? FileManager.default.removeItem(at: tmp) }
        guard let responseURL = responseURL as? HTTPURLResponse, responseURL.statusCode == 200,
              (try tmp.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? Int.max) <= 25 * 1024 * 1024,
              Auth.auth().currentUser?.uid == uid else { throw SyncError.invalidResponse }
        try Data(contentsOf: tmp).write(to: local, options: .atomic)
        return local
    }
}
