import SwiftUI
import Combine
import EhonCore

/// SwiftUI's view of the shared `EditorController`.
///
/// Holds no editing logic of its own — every mutation goes through the controller, because
/// Swift cannot safely construct document values. `apply` republishes after each call, so
/// the controller's `revision` counter is all the change tracking SwiftUI needs.
@MainActor
final class EditorModel: ObservableObject {

    private(set) var controller: EditorController
    let bookId: BookId

    @Published private(set) var revision: Int32 = 0
    @Published var toastText: String?
    @Published private(set) var isReadOnly = false

    private let repository: BookRepository
    private var saveTask: Task<Void, Never>?
    private var fontWatch: AnyCancellable?
    private var assetWatch: AnyCancellable?
    private var leaseWatch: AnyCancellable?

    init(book: Book, uiLevel: UiLevel = .kid, repository: BookRepository? = nil) {
        let repository = repository ?? BookRepository.shared
        self.bookId = book.id
        self.repository = repository
        self.controller = EditorController(
            initial: book,
            measurer: UIKitTextMeasurer(),
            idSource: IdSource(prefix: "i\(UUID().uuidString)-"),
            clock: { KotlinLong(value: Int64(Date().timeIntervalSince1970 * 1000)) }
        )
        controller.setUiLevel(level: uiLevel)
        // A downloaded face changes glyphs, not layout, but the canvas still has to repaint.
        fontWatch = FontLibrary.shared.$states
            .dropFirst()
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in self?.revision &+= 1 }
        assetWatch = NotificationCenter.default.publisher(for: .ehonAssetsChanged)
            .receive(on: RunLoop.main).sink { [weak self] _ in self?.revision &+= 1 }
        leaseWatch = repository.$isReadOnly.sink { [weak self] value in self?.isReadOnly = value }
    }

    func setUiLevel(_ level: UiLevel) {
        apply { $0.setUiLevel(level: level) }
    }

    var book: Book { controller.book }
    var page: Page { controller.page }
    var pageIndex: Int { Int(controller.pageIndex) }
    var mode: EditorMode { controller.mode }
    var selectedId: ItemId? { controller.selectedId }
    var canUndo: Bool { controller.canUndo }
    var isAdult: Bool { controller.isAdult }

    /// Runs an intent, republishes, shows any toast, and schedules a debounced save.
    func apply(_ intent: (EditorController) -> Void) {
        guard !isReadOnly || controller.isGestureActive else { return }
        intent(controller)
        revision &+= 1
        if let key = controller.consumeToast() {
            toastText = Localized.s(key)
            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(1600))
                if toastText == Localized.s(key) { toastText = nil }
            }
        }
        scheduleSave()
        repository.flushRemote()
    }

    /// Sync replaces a completed document, preserving the visible page and UI mode.
    /// Undo is reset when a remote edit lands, so it cannot undo another device's work.
    func receive(_ book: Book) {
        guard book.id == bookId, book != controller.book, !controller.isGestureActive else { return }
        let pageId = page.id, level = controller.uiLevel, mode = controller.mode
        saveTask?.cancel()
        controller = EditorController(initial: book, measurer: UIKitTextMeasurer(),
            idSource: IdSource(prefix: "i\(UUID().uuidString)-"),
            clock: { KotlinLong(value: Int64(Date().timeIntervalSince1970 * 1000)) })
        controller.setUiLevel(level: level)
        controller.setMode(next: mode)
        if let index = (0..<Int(book.pageCount)).first(where: { book.page(index: Int32($0)).id == pageId }) {
            controller.goToPage(index: Int32(index))
        }
        revision &+= 1
    }

    /// Debounced: a child drawing generates hundreds of mutations a minute, and this is the
    /// same write budget Firestore will need later (decision #14).
    private func scheduleSave() {
        saveTask?.cancel()
        saveTask = Task { @MainActor in
            try? await Task.sleep(for: .seconds(2))
            guard !Task.isCancelled else { return }
            repository.save(controller.book)
        }
    }

    /// Called on backgrounding and on leaving the editor, where debouncing isn't safe.
    func saveNow() {
        saveTask?.cancel()
        repository.save(controller.book)
    }
}
