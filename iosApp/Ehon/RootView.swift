import SwiftUI
import EhonCore
import GoogleSignIn

struct RootView: View {
    @StateObject private var app = AppModel()

    var body: some View {
        ZStack {
            Color.ehBg.ignoresSafeArea()
            content
        }
        .environmentObject(app)
        .onOpenURL { url in _ = GIDSignIn.sharedInstance.handle(url) }
        .onChange(of: scenePhaseValue) { _, phase in
            // Debounced saves are not safe across a backgrounding.
            if phase != .active { app.editor?.saveNow() }
            if phase == .active { Task { await MaterialCatalog.shared.refresh() } }
            app.repository.setForeground(phase == .active)
        }
    }

    @Environment(\.scenePhase) private var scenePhaseValue

    private var isPad: Bool { UIDevice.current.userInterfaceIdiom == .pad }

    @ViewBuilder
    private var content: some View {
        switch app.screen {
        case .shelf:
            ShelfView()
        case .templates:
            TemplatesView()
        case .editor(let id):
            if let editor = app.editor, editor.bookId == id {
                if isPad { TabletRootView(model: editor, startReading: false) } else { EditorView(model: editor) }
            } else {
                recovery
            }
        case .read(let id, let page):
            if let book = app.book(id) {
                if isPad, let editor = app.editor, editor.bookId == id {
                    TabletRootView(model: editor, startReading: true, startPage: page)
                } else {
                    ReadView(book: book, startPage: page)
                }
            } else {
                recovery
            }
        case .done(let id):
            if let book = app.book(id) {
                DoneView(book: book)
            } else {
                recovery
            }
        case .share(let id):
            if let book = app.book(id) {
                ShareView(book: book)
            } else {
                recovery
            }
        case .guest(let id):
            if let book = app.book(id) {
                GuestView(book: book)
            } else {
                recovery
            }
        }
    }

    private var recovery: some View {
        ShelfView().onAppear { app.openShelf() }
    }
}
