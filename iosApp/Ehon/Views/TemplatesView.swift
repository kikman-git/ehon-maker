import SwiftUI
import EhonCore

/// テンプレート — the published stories (decision #60), each shown as its real opening spread. The
/// stories come from the backend and are cached on the phone; a release build bundles none, a Debug
/// build reads the assembled copy (decision #61). The blank start lives on the shelf (decision #62).
struct TemplatesView: View {
    @EnvironmentObject var app: AppModel
    @StateObject private var catalog = TemplateCatalog()

    var body: some View {
        VStack(spacing: 0) {
            header
            Text(Localized.s("templates.intro"))
                .font(.ehUI(12.5, .medium))
                .foregroundStyle(Color.ehMuted)
                .lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 18)
                .padding(.bottom, 12)
            ScrollView {
                VStack(spacing: 14) {
                    ForEach(catalog.entries) { entry in
                        StoryCard(entry: entry) { app.startDocumentTemplate(json: entry.json) }
                    }
                    status
                }
                .padding(.horizontal, 18)
                .padding(.bottom, 60)
            }
        }
        .background(Color.ehBg)
        .task { await catalog.load() }
    }

    private var header: some View {
        HStack(spacing: 12) {
            CircleIconButton(systemName: "arrow.left", diameter: 44) { app.openShelf() }
            Text(Localized.s("templates.title"))
                .font(.ehUI(22, .black))
                .foregroundStyle(Color.ehText)
            Spacer()
        }
        .padding(.horizontal, 18)
        .padding(.bottom, 8)
    }

    @ViewBuilder private var status: some View {
        switch catalog.state {
        case .loading:
            HStack(spacing: 10) {
                ProgressView()
                Text(Localized.s("templates.loading")).font(.ehUI(12.5, .medium)).foregroundStyle(Color.ehMuted)
            }
            .padding(.vertical, 8)
        case .failed:
            VStack(spacing: 10) {
                Text(Localized.s("templates.offline")).font(.ehUI(12.5, .medium)).foregroundStyle(Color.ehMuted)
                    .multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
                Button(Localized.s("templates.retry")) { Task { await catalog.load() } }
                    .font(.ehUI(13, .bold)).foregroundStyle(Color.ehAccentDeep)
            }
            .frame(maxWidth: .infinity)
            .padding(14)
            .background(RoundedRectangle(cornerRadius: 20).fill(Color.ehSunken))
        default:
            EmptyView()
        }
    }
}

/// A real opening spread, so picture and text pages can be assessed together.
private struct StoryCard: View {
    let entry: TemplateCatalog.Entry
    let onUse: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 3) {
                ForEach(0..<min(2, entry.pageCount), id: \.self) { index in
                    DocumentPagePreview(book: entry.book, index: index)
                }
            }
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(entry.title).font(.ehUI(17, .black)).foregroundStyle(Color.ehText)
                Text(Localized.s("book.pages", entry.pageCount))
                    .font(.ehUI(11.5, .medium)).foregroundStyle(Color.ehMuted)
            }
            Text(entry.description).font(.ehUI(12.5, .medium)).foregroundStyle(Color.ehMuted).lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)
            Text(Localized.s("templates.editable"))
                .font(.ehUI(11)).foregroundStyle(Color.ehAccentDeep)
                .padding(.horizontal, 10).padding(.vertical, 4)
                .background(Capsule().fill(Color.ehAccentTint))
            PillButton(title: Localized.s("home.newBook"), filled: true, big: true, action: onUse)
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 28).fill(Color.ehSunken))
        .ehElevation(1)
    }
}

private struct DocumentPagePreview: View {
    let book: Book
    let index: Int
    @ObservedObject private var resources = SceneResources.shared
    private static let builder = SceneBuilder(measurer: UIKitTextMeasurer(), resolver: PartRegistry.shared)
    private static let painter = ScenePainter()

    var body: some View {
        let _ = resources.revision
        GeometryReader { geo in
            let target = RenderTarget.Companion.shared.screen(
                shape: book.shape,
                available: Size(w: Float(max(geo.size.width, 1)), h: Float(max(geo.size.height, 1))),
                selectedItem: nil
            )
            let scene = Self.builder.build(page: book.page(index: Int32(index)), target: target, promptText: nil, art: book.art)
            Canvas { ctx, _ in ctx.withCGContext { Self.painter.draw(scene, into: $0) } }
                .frame(width: CGFloat(scene.size.w), height: CGFloat(scene.size.h))
        }
        .aspectRatio(CGFloat(book.shape.aspect), contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 3))
        .frame(maxWidth: .infinity)
    }
}
