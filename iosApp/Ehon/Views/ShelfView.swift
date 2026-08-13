import SwiftUI
import EhonCore

/// ほんだな — the bookshelf. Two-column grid, "make a new one" first, newest books after.
struct ShelfView: View {
    @EnvironmentObject var app: AppModel
    @State private var filter: ShelfFilter = .all

    enum ShelfFilter { case all, inProgress, finished }

    private var visible: [Book] {
        switch filter {
        case .all: return app.books
        case .inProgress: return app.inProgress
        case .finished: return app.finished
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            filters
            ScrollView {
                LazyVGrid(columns: [GridItem(spacing: 16), GridItem(spacing: 16)],
                          alignment: .leading, spacing: 16) {
                    NewBookTile { app.openTemplates() }
                    ForEach(visible, id: \.id.value) { book in
                        BookTile(book: book) { app.open(book) }
                    }
                }
                .padding(.horizontal, 18)
                .padding(.bottom, 132)
            }
        }
        .background(Color.ehBg)
        .overlay(alignment: .bottom) { tabBar }
    }

    private var header: some View {
        HStack(alignment: .bottom, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(Localized.s("home.greeting", childName))
                    .font(.ehUI(12.5, .medium))
                    .foregroundStyle(Color.ehMuted)
                Text(Localized.s("home.shelf"))
                    .font(.ehUI(31, .black))
                    .foregroundStyle(Color.ehText)
            }
            Spacer()
            Text(String(childName.prefix(1)))
                .font(.ehUI(17))
                .foregroundStyle(Color.ehAccentDeep)
                .frame(width: 46, height: 46)
                .background(Circle().fill(Color.ehAccentTint))
                .overlay(Circle().strokeBorder(Color.ehAccent.opacity(0.6), lineWidth: 2))
        }
        .padding(.horizontal, 20)
        .padding(.top, 10)
        .padding(.bottom, 10)
    }

    private var filters: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 7) {
                Chip(title: Localized.s("home.filter.all", app.books.count),
                     selected: filter == .all) { filter = .all }
                Chip(title: Localized.s("home.filter.inProgress", app.inProgress.count),
                     selected: filter == .inProgress) { filter = .inProgress }
                Chip(title: Localized.s("home.filter.finished", app.finished.count),
                     selected: filter == .finished) { filter = .finished }
            }
            .padding(.horizontal, 20)
        }
        .padding(.bottom, 12)
    }

    private var tabBar: some View {
        HStack(spacing: 4) {
            tab(Localized.s("nav.shelf"), active: true) {}
            tab(Localized.s("nav.make"), active: false) { app.openTemplates() }
            tab(Localized.s("nav.read"), active: false) {
                if let latest = app.books.first { app.openRead(latest) }
            }
        }
        .padding(6)
        .background(
            Capsule().fill(Color.ehSunken.opacity(0.94))
                .background(.ultraThinMaterial, in: Capsule())
        )
        .ehElevation(2)
        .padding(.horizontal, 16)
        .padding(.bottom, 42)
    }

    private func tab(_ title: String, active: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.ehUI(14))
                .foregroundStyle(active ? Color.ehSurface : .ehMuted)
                .frame(maxWidth: .infinity)
                .frame(height: 52)
                .background(Capsule().fill(active ? Color.ehInk : .clear))
        }
        .buttonStyle(.plain)
    }

    /// Placeholder until onboarding asks. The greeting is deliberately personal — it is the
    /// child's own shelf, not a generic library.
    private var childName: String {
        UserDefaults.standard.string(forKey: "childName")
            ?? (Localized.isJapaneseUI ? "みお" : "friend")
    }
}

private struct NewBookTile: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 9) {
                RoundedRectangle(cornerRadius: 28)
                    .strokeBorder(Color.ehAccent.opacity(0.75),
                                  style: StrokeStyle(lineWidth: 2.5, dash: [7, 5]))
                    .background(RoundedRectangle(cornerRadius: 28).fill(Color.ehAccentTint.opacity(0.5)))
                    .aspectRatio(3.0 / 4.0, contentMode: .fit)
                    .overlay {
                        VStack(spacing: 9) {
                            Image(systemName: "plus")
                                .font(.system(size: 26, weight: .heavy))
                                .foregroundStyle(Color.ehSurface)
                                .frame(width: 52, height: 52)
                                .background(Circle().fill(Color.ehAccent))
                            Text(Localized.s("home.newBook"))
                                .font(.ehUI(13))
                                .foregroundStyle(Color.ehAccentDeep)
                        }
                    }
                Spacer(minLength: 30)
            }
        }
        .buttonStyle(.plain)
    }
}

/// A book's cover: its first page rendered small, with a spine and the title in Yomogi.
private struct BookTile: View {
    let book: Book
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 9) {
                ZStack(alignment: .bottomLeading) {
                    CoverThumbnail(book: book)
                    // The spine, which is what makes a rectangle read as a book.
                    HStack(spacing: 0) {
                        Rectangle().fill(Color.ehInk.opacity(0.13)).frame(width: 9)
                        Spacer()
                    }
                    Text(book.title)
                        .font(.ehBody(13))
                        .foregroundStyle(titleColour)
                        .lineLimit(2)
                        .padding(.leading, 14)
                        .padding(.trailing, 12)
                        .padding(.bottom, 12)
                }
                .aspectRatio(3.0 / 4.0, contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: 28))
                .ehElevation(1)

                HStack(spacing: 6) {
                    Text(Localized.s("book.pages", book.pageCount))
                        .font(.ehUI(11))
                        .foregroundStyle(Color.ehAccentDeep)
                        .padding(.horizontal, 9)
                        .padding(.vertical, 3)
                        .background(Capsule().fill(Color.ehAccentTint))
                    Text(Localized.shapeName(book.shape))
                        .font(.ehUI(11.5, .medium))
                        .foregroundStyle(Color.ehMuted)
                }
                .frame(minHeight: 30, alignment: .topLeading)
            }
        }
        .buttonStyle(.plain)
    }

    /// Dark covers need light type. Luminance rather than a hardcoded list of colours.
    private var titleColour: Color {
        let c = book.page(index: 0).background
        let packed = UInt32(bitPattern: c)
        let luma = (0.2126 * Double((packed >> 16) & 0xFF)
            + 0.7152 * Double((packed >> 8) & 0xFF)
            + 0.0722 * Double(packed & 0xFF)) / 255
        return luma < 0.5 ? .ehSurface : .ehInk
    }
}

/// Renders page 1 through the same painter as everything else, cropped to a 3:4 cover.
private struct CoverThumbnail: View {
    let book: Book

    private static let builder = SceneBuilder(measurer: UIKitTextMeasurer())
    private static let painter = ScenePainter()

    var body: some View {
        GeometryReader { geo in
            let target = RenderTarget.Companion.shared.screen(
                shape: book.shape,
                available: Size(w: Float(max(geo.size.width, 1)), h: Float(max(geo.size.height, 1))),
                selectedItem: nil
            )
            let scene = Self.builder.build(page: book.page(index: 0), target: target, promptText: nil)
            Canvas { ctx, _ in
                ctx.withCGContext { Self.painter.draw(scene, into: $0) }
            }
            .frame(width: CGFloat(scene.size.w), height: CGFloat(scene.size.h))
            .frame(width: geo.size.width, height: geo.size.height)
            .background(Color(book.page(index: 0).background.uiColor))
        }
    }
}
