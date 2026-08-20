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

    /// An imported archive carries its own id and title, so both are untrusted before they
    /// reach a path component: `appendingPathComponent` walks out of the directory on `../`.
    /// Leading dots go too — they would hide the file rather than escape it.
    private static func pathSafe(_ raw: String) -> String {
        let stripped = raw
            .components(separatedBy: CharacterSet(charactersIn: "/\\:?%*|\"<>"))
            .joined()
        var name = String(stripped.drop(while: { $0 == "." || $0 == " " }))
        // Counted in bytes, not characters: 200 kana still exceed the 255-byte name limit.
        while name.utf8.count > 200 { name.removeLast() }
        return name
    }

    private func url(for id: BookId) -> URL {
        let name = Self.pathSafe(id.value)
        return directory.appendingPathComponent(
            "\(name.isEmpty ? "untitled" : name).\(BookCodec.shared.ARCHIVE_EXTENSION)"
        )
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
        let safeTitle = Self.pathSafe(book.title)
        let fallback = Self.pathSafe(book.id.value)
        let name = safeTitle.isEmpty ? (fallback.isEmpty ? "book" : fallback) : safeTitle
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
