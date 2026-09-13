import Foundation
import EhonCore

/// The story templates, fetched from the assets Worker's `templates/index.json` and kept on disk by
/// content hash (decision #60). The app bundles none: a build without cloud configuration offers the
/// blank book only, and a phone that has fetched once keeps its copy when offline.
@MainActor
final class TemplateCatalog: ObservableObject {
    struct Entry: Identifiable {
        let id: String
        let title: String
        let description: String
        let pageCount: Int
        let json: String
        let book: Book
    }

    enum State { case unavailable, loading, ready, failed }

    @Published private(set) var state: State = .unavailable
    @Published private(set) var entries: [Entry] = []

    private struct Index: Decodable { let version: Int; let templates: [IndexEntry] }
    private struct IndexEntry: Decodable {
        let id: String
        let order: Int
        let description: [String: String]
        let format: Int
        let sha256: String
        let url: String
    }

    private let directory: URL
    private let session: URLSession

    init(directory: URL? = nil, session: URLSession = .shared) {
        self.directory = directory ?? FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("templates", isDirectory: true)
        self.session = session
        try? FileManager.default.createDirectory(at: self.directory, withIntermediateDirectories: true)
    }

    /// Shows the cached list at once, then refreshes it from the network.
    func load() async {
        guard let base = CloudConfiguration.assetsURL else { state = .unavailable; return }
        if entries.isEmpty, let cached = try? Data(contentsOf: directory.appendingPathComponent("index.json")) {
            entries = await materialize(index: cached, base: base, allowNetwork: false)
        }
        state = entries.isEmpty ? .loading : .ready
        do {
            let (data, response) = try await session.data(from: base.appendingPathComponent("templates/index.json"))
            if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) { throw URLError(.badServerResponse) }
            let fresh = await materialize(index: data, base: base, allowNetwork: true)
            if !fresh.isEmpty {
                entries = fresh
                try? data.write(to: directory.appendingPathComponent("index.json"), options: .atomic)
            }
        } catch {
            // The cached list, if any, stays; a first launch offline shows the retry row.
        }
        state = entries.isEmpty ? .failed : .ready
    }

    /// Decodes the index and gathers each document, from the disk cache by content hash or from the network.
    private func materialize(index data: Data, base: URL, allowNetwork: Bool) async -> [Entry] {
        guard let index = try? JSONDecoder().decode(Index.self, from: data) else { return [] }
        var result: [Entry] = []
        for item in index.templates.sorted(by: { $0.order < $1.order }) where item.format <= Int(BookCodec.shared.FORMAT_VERSION) {
            let file = directory.appendingPathComponent("\(item.id)-\(item.sha256.prefix(12)).ehon.json")
            var json = try? String(contentsOf: file, encoding: .utf8)
            if json == nil, allowNetwork, let (bytes, _) = try? await session.data(from: base.appendingPathComponent("templates/\(item.url)")) {
                json = String(data: bytes, encoding: .utf8)
                if let json { try? json.write(to: file, atomically: true, encoding: .utf8) }
            }
            guard let json, let book = BookCodec.shared.decodeOrNull(text: json) else { continue }
            let description = item.description[Localized.isJapaneseUI ? "ja" : "en"] ?? item.description["ja"] ?? ""
            result.append(Entry(id: item.id, title: book.title, description: description, pageCount: Int(book.pageCount), json: json, book: book))
        }
        return result
    }
}
