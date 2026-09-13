import SwiftUI
import Combine
import EhonCore

/// Which screen is showing. The prototype's five, unchanged.
enum Screen: Equatable {
    case shelf
    case templates
    case editor(BookId)
    case read(BookId, page: Int)
    case done(BookId)
    /// かぞくに おくる — model 2a.
    case share(BookId)
    /// What a family member sees when they open the link — model 3b.
    case guest(BookId)
}

@MainActor
final class AppModel: ObservableObject {

    @Published var screen: Screen = .shelf
    @Published private(set) var books: [Book] = []
    @Published var editor: EditorModel?

    /// Decision #12: `bigTargets` is a plain accessibility setting, not a kid/parent mode.
    @AppStorage("bigTargets") var bigTargets = false

    /// こども / おとな (model 2a). Stored as its Kotlin id; kid also implies big targets.
    @AppStorage("uiLevel") private var uiLevelRaw = "kid"

    var uiLevel: UiLevel {
        get { uiLevelRaw == "adult" ? .adult : .kid }
        set {
            uiLevelRaw = newValue == .adult ? "adult" : "kid"
            editor?.setUiLevel(newValue)
        }
    }

    var effectiveBigTargets: Bool { bigTargets || uiLevel == .kid }

    let repository = BookRepository.shared
    private var repositoryWatch: AnyCancellable?

    init() {
        repository.liveBook = { [weak self] id in self?.editor?.bookId.value == id ? self?.editor?.book : nil }
        repository.isGestureActive = { [weak self] in self?.editor?.controller.isGestureActive ?? false }
        repository.onRemote = { [weak self] book in self?.editor?.receive(book) }
        repository.onIdentityChange = { [weak self] in self?.editor = nil; self?.screen = .shelf }
        repositoryWatch = repository.$books.sink { [weak self] books in self?.books = books }
        reload()
        applyDebugRoute()
    }

    /// Jumps straight to a screen from a launch argument, creating a sample book if needed.
    /// Used by `make shots`; a release build never passes these.
    private func applyDebugRoute() {
        let defaults = UserDefaults.standard
        guard let route = defaults.string(forKey: "startScreen") else { return }
        guard route != "shelf" else { return }
        if route == "templates" { screen = .templates; return }
        if let level = defaults.string(forKey: "uiLevel") { uiLevelRaw = level }

        let book: Book? = books.first ?? Templates.shared.instantiate(
            template: Templates.shared.blank,
            bookId: BookId(value: "sample"),
            title: Localized.s(Templates.shared.blank.nameKey),
            contentLocale: bookLocale,
            nowEpochMs: Int64(Date().timeIntervalSince1970 * 1000),
            shapeOverride: nil,
            idSource: IdSource(prefix: "i")
        )
        guard let book else { return }
        repository.save(book)
        reload()

        switch route {
        case "editor": open(book)
        case "read": openRead(book)
        case "done": openDone(book)
        case "share": openShare(book)
        case "guest": openGuest(book)
        default: break
        }

        if let mode = defaults.string(forKey: "mode"), let editor {
            switch mode {
            case "draw": editor.apply { $0.setMode(next: .draw) }
            case "text": editor.apply { $0.setMode(next: .text) }
            default: break
            }
        }
    }

    func reload() {
        repository.reload()
        books = repository.books
    }

    // MARK: - navigation

    func openShelf() {
        editor?.saveNow()
        repository.close()
        editor = nil
        reload()
        screen = .shelf
    }

    func openTemplates() { editor?.saveNow(); repository.close(); editor = nil; screen = .templates }

    func startBook(from template: Template, shape: PageShape?) {
        let book = Templates.shared.instantiate(
            template: template,
            bookId: BookId(value: "b\(UUID().uuidString)"),
            title: Localized.s(template.nameKey),
            contentLocale: bookLocale,
            nowEpochMs: Int64(Date().timeIntervalSince1970 * 1000),
            shapeOverride: shape,
            idSource: IdSource(prefix: "i")
        )
        repository.save(book)
        reload()
        open(book)
    }

    /// A fetched story becomes a book on this shelf (decision #60).
    func startDocumentTemplate(json: String) {
        let book = Templates.shared.instantiateDocument(
            json: json,
            bookId: BookId(value: "b\(UUID().uuidString)"),
            nowEpochMs: Int64(Date().timeIntervalSince1970 * 1000)
        )
        repository.save(book)
        reload()
        open(book)
    }

    func open(_ book: Book) {
        editor?.saveNow()
        editor = EditorModel(book: book, uiLevel: uiLevel, repository: repository)
        repository.open(book, editing: true)
        screen = .editor(book.id)
    }

    func openShare(_ book: Book) {
        editor?.saveNow()
        reload()
        screen = .share(book.id)
        repository.open(book, editing: false)
    }

    func openGuest(_ book: Book) {
        editor?.saveNow()
        reload()
        screen = .guest(book.id)
        repository.open(book, editing: false)
    }

    /// A reply arrived (in v1: recorded on this device). Persist it and refresh the shelf.
    func attach(reply: PageReply?, toPage page: Int, of book: Book) {
        let updated = (self.book(book.id) ?? book).withReply(pageIndex: Int32(page), reply: reply)
        repository.save(updated)
        editor?.receive(updated)
        reload()
    }

    func openRead(_ book: Book, page: Int = 0) {
        editor?.saveNow()
        // The tablet read view is a mode of the tablet editor, so it needs the model even
        // when reading starts from the shelf rather than from つくる.
        if UIDevice.current.userInterfaceIdiom == .pad, editor?.bookId != book.id {
            editor = EditorModel(book: book, uiLevel: uiLevel, repository: repository)
        }
        screen = .read(book.id, page: page)
        repository.open(book, editing: false)
    }

    func openDone(_ book: Book) {
        editor?.saveNow()
        reload()
        screen = .done(book.id)
        repository.open(book, editing: false)
    }

    func delete(_ book: Book) {
        repository.delete(book)
        repository.close()
        if editor?.bookId == book.id { editor = nil }
        reload()
        screen = .shelf
    }

    func book(_ id: BookId) -> Book? {
        editor?.bookId == id ? editor?.book : books.first { $0.id == id }
    }

    /// A new book's content language follows the device at creation time, then stays put —
    /// decision #2. Switching the phone to English must not restyle a Japanese book.
    private var bookLocale: String {
        Localized.isJapaneseUI ? "ja-JP" : "en-US"
    }

    // MARK: - shelf grouping, for the filter chips

    var inProgress: [Book] { books.filter { !isFinished($0) } }
    var finished: [Book] { books.filter { isFinished($0) } }

    /// v1 has no explicit "finished" flag; reaching the done screen is what a parent means
    /// by it, and that's a field to add when the paywall lands and it starts to matter.
    private func isFinished(_ book: Book) -> Bool {
        UserDefaults.standard.bool(forKey: "finished-\(book.id.value)")
    }

    func markFinished(_ book: Book) {
        UserDefaults.standard.set(true, forKey: "finished-\(book.id.value)")
        reload()
    }
}
