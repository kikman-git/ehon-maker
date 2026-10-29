import Foundation
import CryptoKit
import EhonCore

@MainActor
final class MaterialCatalog {
    static let shared = MaterialCatalog()
    private struct Pointer: Codable { let version: Int; let revision: String; let file: String; let bytes: Int }
    private struct Cached: Codable { let pointer: Pointer; let json: Data }
    private let directory: URL
    private let baseURL: () -> URL?
    private let session: URLSession
    private var loading = false
    private(set) var revision: String?

    init(directory: URL? = nil, baseURL: @escaping () -> URL? = { CloudConfiguration.assetsURL }, session: URLSession = .shared) {
        self.directory = directory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("material-catalog", isDirectory: true)
        self.baseURL = baseURL
        self.session = session
        try? FileManager.default.createDirectory(at: self.directory, withIntermediateDirectories: true)
    }

    private var file: URL {
        let scope = baseURL()?.absoluteString ?? "offline"
        let hash = SHA256.hash(data: Data(scope.utf8)).map { String(format: "%02x", $0) }.joined()
        return directory.appendingPathComponent("\(hash).json")
    }

    func restore() {
        guard let bytes = try? Data(contentsOf: file), bytes.count <= 3_000_000,
              let cached = try? JSONDecoder().decode(Cached.self, from: bytes) else { return }
        _ = accept(cached)
    }

    func refresh() async {
        guard !loading, let base = baseURL() else { return }
        loading = true
        defer { loading = false }
        do {
            var request = URLRequest(url: base.appendingPathComponent("materials/index.json"), cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 15)
            let (bytes, response) = try await session.data(for: request)
            guard (response as? HTTPURLResponse)?.statusCode == 200, bytes.count < 4096 else { return }
            let pointer = try JSONDecoder().decode(Pointer.self, from: bytes)
            guard valid(pointer) else { return }
            request = URLRequest(url: base.appendingPathComponent("materials/\(pointer.file)"), timeoutInterval: 20)
            let (json, catalogResponse) = try await session.data(for: request)
            guard (catalogResponse as? HTTPURLResponse)?.statusCode == 200 else { return }
            let cached = Cached(pointer: pointer, json: json)
            guard accept(cached) else { return }
            try JSONEncoder().encode(cached).write(to: file, options: .atomic)
        } catch { /* Keep the last validated catalog when the network is unavailable. */ }
    }

    private func valid(_ pointer: Pointer) -> Bool {
        pointer.version == 1 && pointer.revision.range(of: "^[0-9a-f]{64}$", options: .regularExpression) != nil &&
            pointer.file == "catalogs/\(pointer.revision).json" && (1...2_000_000).contains(pointer.bytes)
    }

    private func accept(_ cached: Cached) -> Bool {
        guard valid(cached.pointer), cached.json.count == cached.pointer.bytes,
              SHA256.hash(data: cached.json).map({ String(format: "%02x", $0) }).joined() == cached.pointer.revision,
              let json = String(data: cached.json, encoding: .utf8), PartCatalog.shared.installJson(text: json) else { return false }
        revision = cached.pointer.revision
        NotificationCenter.default.post(name: .ehonAssetsChanged, object: nil)
        return true
    }
}
