import SwiftUI
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

    private let store = LocalBookStore.shared

    init() {
        reload()
        applyDebugRoute()
    }

    /// Jumps straight to a screen from a launch argument, creating a sample book if needed.
    /// Used by `make shots`; a release build never passes these.
    private func applyDebugRoute() {
        let defaults = UserDefaults.standard
        guard let route = defaults.string(forKey: "startScreen") else { return }
        let templateId = defaults.string(forKey: "template") ?? "t1"
        guard route != "shelf" else { return }
        if route == "templates" { screen = .templates; return }
        if let level = defaults.string(forKey: "uiLevel") { uiLevelRaw = level }

        let book = books.first ?? {
            guard let template = Templates.shared.find(id: templateId) else { return nil }
            return Templates.shared.instantiate(
                template: template,
                bookId: BookId(value: "sample"),
                title: Localized.s(template.nameKey),
                contentLocale: bookLocale,
                nowEpochMs: Int64(Date().timeIntervalSince1970 * 1000),
                shapeOverride: nil,
                idSource: IdSource(prefix: "i")
            )
        }()
        guard let book else { return }
        store.save(book)
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
        books = store.loadAll()
    }

    // MARK: - navigation

    func openShelf() {
        editor?.saveNow()
        reload()
        screen = .shelf
    }

    func openTemplates() { screen = .templates }

    func startBook(from template: Template, shape: PageShape?) {
        let book = Templates.shared.instantiate(
            template: template,
            bookId: BookId(value: "b\(UUID().uuidString.prefix(8))"),
            title: Localized.s(template.nameKey),
            contentLocale: bookLocale,
            nowEpochMs: Int64(Date().timeIntervalSince1970 * 1000),
            shapeOverride: shape,
            idSource: IdSource(prefix: "i")
        )
        store.save(book)
        reload()
        open(book)
    }

    func open(_ book: Book) {
        editor = EditorModel(book: book, uiLevel: uiLevel)
        screen = .editor(book.id)
    }

    func openShare(_ book: Book) {
        editor?.saveNow()
        reload()
        screen = .share(book.id)
    }

    func openGuest(_ book: Book) {
        editor?.saveNow()
        reload()
        screen = .guest(book.id)
    }

    /// A reply arrived (in v1: recorded on this device). Persist it and refresh the shelf.
    func attach(reply: PageReply?, toPage page: Int, of book: Book) {
        store.save(book.withReply(pageIndex: Int32(page), reply: reply))
        reload()
    }

    func openRead(_ book: Book, page: Int = 0) {
        editor?.saveNow()
        // The tablet read view is a mode of the tablet editor, so it needs the model even
        // when reading starts from the shelf rather than from つくる.
        if UIDevice.current.userInterfaceIdiom == .pad, editor?.bookId != book.id {
            editor = EditorModel(book: book, uiLevel: uiLevel)
        }
        screen = .read(book.id, page: page)
    }

    func openDone(_ book: Book) {
        editor?.saveNow()
        reload()
        screen = .done(book.id)
    }

    func delete(_ book: Book) {
        store.delete(book.id)
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
