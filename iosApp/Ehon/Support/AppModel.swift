import SwiftUI
import Combine
import EhonCore

enum Screen: Equatable {
    case shelf
    case templates
    case editor(BookId)
    case read(BookId, page: Int)
    case done(BookId)
    case share(BookId)
    case guest(BookId)
}

@MainActor
final class AppModel: ObservableObject {

    @Published var screen: Screen = .shelf
    @Published private(set) var books: [Book] = []
    @Published var editor: EditorModel?

    @AppStorage("bigTargets") var bigTargets = false

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
        MaterialCatalog.shared.restore()
        Task { await MaterialCatalog.shared.refresh() }
        repository.liveBook = { [weak self] id in self?.editor?.bookId.value == id ? self?.editor?.book : nil }
        repository.isGestureActive = { [weak self] in self?.editor?.controller.isGestureActive ?? false }
        repository.onRemote = { [weak self] book in self?.editor?.receive(book) }
        repository.onIdentityChange = { [weak self] in self?.editor = nil; self?.screen = .shelf }
        repositoryWatch = repository.$books.sink { [weak self] books in self?.books = books }
        reload()
        applyDebugRoute()
    }

    private func applyDebugRoute() {
        let defaults = UserDefaults.standard
        guard let route = defaults.string(forKey: "startScreen") else { return }
        guard route != "shelf" else { return }
        if route == "templates" { screen = .templates; return }
        if let level = defaults.string(forKey: "uiLevel") { uiLevelRaw = level }

        let book = books.first ?? Templates.shared.blankBook(
            bookId: BookId(value: "sample"),
            title: Localized.s("book.untitled"),
            contentLocale: bookLocale,
            nowEpochMs: Int64(Date().timeIntervalSince1970 * 1000),
            shape: .square
        )
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

    func openShelf() {
        editor?.saveNow()
        repository.close()
        editor = nil
        reload()
        screen = .shelf
    }

    func openTemplates() { editor?.saveNow(); repository.close(); editor = nil; screen = .templates }

    func startBlankBook() {
        let book = Templates.shared.blankBook(
            bookId: BookId(value: "b\(UUID().uuidString)"),
            title: Localized.s("book.untitled"),
            contentLocale: bookLocale,
            nowEpochMs: Int64(Date().timeIntervalSince1970 * 1000),
            shape: .square
        )
        repository.save(book)
        reload()
        open(book)
    }

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

    func attach(reply: PageReply?, toPage page: Int, of book: Book) {
        let updated = (self.book(book.id) ?? book).withReply(pageIndex: Int32(page), reply: reply)
        repository.save(updated)
        editor?.receive(updated)
        reload()
    }

    func openRead(_ book: Book, page: Int = 0) {
        editor?.saveNow()
        // Tablet reading shares the editor model even when opened from the shelf.
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

    // Capture language at creation so a later UI language change cannot restyle a book.
    private var bookLocale: String {
        Localized.isJapaneseUI ? "ja-JP" : "en-US"
    }

    var inProgress: [Book] { books.filter { !isFinished($0) } }
    var finished: [Book] { books.filter { isFinished($0) } }

    private func isFinished(_ book: Book) -> Bool {
        UserDefaults.standard.bool(forKey: "finished-\(book.id.value)")
    }

    func markFinished(_ book: Book) {
        UserDefaults.standard.set(true, forKey: "finished-\(book.id.value)")
        reload()
    }
}
