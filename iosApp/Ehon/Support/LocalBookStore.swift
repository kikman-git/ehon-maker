import Foundation
import EhonCore

/// On-device book storage: one JSON file per book, plus a lightweight index built by
/// reading the directory.
///
/// This is the whole of v1 persistence. Firestore (decisions #13/#14) sits *behind* this
/// same interface later — the shape here is deliberately the shape a repository wants, so
/// adding sync is an implementation swap rather than a rewrite. Files live in `Documents`,
/// which iOS includes in device backup by default, so a new phone restores the shelf.
final class LocalBookStore {

    static let shared = LocalBookStore()

    private let directory: URL

    init(directory: URL? = nil) {
        self.directory = directory ?? FileManager.default
            .urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("books", isDirectory: true)
        try? FileManager.default.createDirectory(at: self.directory, withIntermediateDirectories: true)
    }

    private func url(for id: BookId) -> URL {
        directory.appendingPathComponent("\(id.value).\(BookCodec.shared.ARCHIVE_EXTENSION)")
    }

    // MARK: - reads

    /// Newest first, so the shelf shows what the child was last working on.
    func loadAll() -> [Book] {
        let files = (try? FileManager.default.contentsOfDirectory(
            at: directory, includingPropertiesForKeys: nil
        )) ?? []
        return files
            .filter { $0.pathExtension == BookCodec.shared.ARCHIVE_EXTENSION }
            .compactMap { load(from: $0) }
            .sorted { $0.updatedAtEpochMs > $1.updatedAtEpochMs }
    }

    func load(from url: URL) -> Book? {
        guard let text = try? String(contentsOf: url, encoding: .utf8) else { return nil }
        // decodeOrNull rather than a throw: one corrupt file must not empty the shelf.
        return BookCodec.shared.decodeOrNull(text: text)
    }

    // MARK: - writes

    func save(_ book: Book) {
        let text = BookCodec.shared.encode(book: book)
        try? text.write(to: url(for: book.id), atomically: true, encoding: .utf8)
    }

    func delete(_ id: BookId) {
        try? FileManager.default.removeItem(at: url(for: id))
    }

    // MARK: - archive, i.e. decision #15's belt-and-braces

    /// Writes a shareable `.ehon` file to a temporary location and returns its URL.
    func exportArchive(_ book: Book) -> URL? {
        let safeTitle = book.title
            .components(separatedBy: CharacterSet(charactersIn: "/\\:?%*|\"<>"))
            .joined()
        let name = safeTitle.isEmpty ? book.id.value : safeTitle
        let target = FileManager.default.temporaryDirectory
            .appendingPathComponent("\(name).\(BookCodec.shared.ARCHIVE_EXTENSION)")
        do {
            try BookCodec.shared.encode(book: book).write(to: target, atomically: true, encoding: .utf8)
            return target
        } catch {
            return nil
        }
    }

    /// Imports an archive, keeping the incoming book's id so re-importing is idempotent.
    @discardableResult
    func importArchive(at url: URL) -> Book? {
        guard let book = load(from: url) else { return nil }
        save(book)
        return book
    }
}
