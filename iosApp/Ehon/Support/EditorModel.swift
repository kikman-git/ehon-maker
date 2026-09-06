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

    let controller: EditorController
    let bookId: BookId

    @Published private(set) var revision: Int32 = 0
    @Published var toastText: String?

    private let store: LocalBookStore
    private var saveTask: Task<Void, Never>?
    private var fontWatch: AnyCancellable?

    init(book: Book, uiLevel: UiLevel = .kid, store: LocalBookStore = .shared) {
        self.bookId = book.id
        self.store = store
        self.controller = EditorController(
            initial: book,
            measurer: UIKitTextMeasurer(),
            idSource: IdSource(prefix: "i\(Int(Date().timeIntervalSince1970))-"),
            clock: { KotlinLong(value: Int64(Date().timeIntervalSince1970 * 1000)) }
        )
        controller.setUiLevel(level: uiLevel)
        // A downloaded face changes glyphs, not layout, but the canvas still has to repaint.
        fontWatch = FontLibrary.shared.$states
            .dropFirst()
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in self?.revision &+= 1 }
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
        intent(controller)
        revision = controller.revision
        if let key = controller.consumeToast() {
            toastText = Localized.s(key)
            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(1600))
                if toastText == Localized.s(key) { toastText = nil }
            }
        }
        scheduleSave()
    }

    /// Debounced: a child drawing generates hundreds of mutations a minute, and this is the
    /// same write budget Firestore will need later (decision #14).
    private func scheduleSave() {
        saveTask?.cancel()
        saveTask = Task { @MainActor in
            try? await Task.sleep(for: .seconds(2))
            guard !Task.isCancelled else { return }
            store.save(controller.book)
        }
    }

    /// Called on backgrounding and on leaving the editor, where debouncing isn't safe.
    func saveNow() {
        saveTask?.cancel()
        store.save(controller.book)
    }
}
