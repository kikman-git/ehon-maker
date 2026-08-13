import SwiftUI
import EhonCore

/// Routes between the five screens the prototype defined.
struct RootView: View {
    @StateObject private var app = AppModel()

    var body: some View {
        ZStack {
            Color.ehBg.ignoresSafeArea()
            content
        }
        .environmentObject(app)
        .onChange(of: scenePhaseValue) { _, phase in
            // Debounced saves are not safe across a backgrounding.
            if phase != .active { app.editor?.saveNow() }
        }
    }

    @Environment(\.scenePhase) private var scenePhaseValue

    @ViewBuilder
    private var content: some View {
        switch app.screen {
        case .shelf:
            ShelfView()
        case .templates:
            TemplatesView()
        case .editor(let id):
            if let editor = app.editor, editor.bookId == id {
                EditorView(model: editor)
            } else {
                recovery
            }
        case .read(let id, let page):
            if let book = app.book(id) {
                ReadView(book: book, startPage: page)
            } else {
                recovery
            }
        case .done(let id):
            if let book = app.book(id) {
                DoneView(book: book)
            } else {
                recovery
            }
        }
    }

    /// A book that vanished underneath a screen — deleted, or failed to decode. Returning to
    /// the shelf is always safe, and never shows a child an error.
    private var recovery: some View {
        ShelfView().onAppear { app.openShelf() }
    }
}
