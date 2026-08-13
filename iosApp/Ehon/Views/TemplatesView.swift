import SwiftUI
import EhonCore

/// テンプレート — pick a story shape. Each template declares its own page shape
/// (decision #17), so the shape appears as a discovery rather than as a question. Only the
/// blank template offers the picker, where the choice is actually meaningful.
struct TemplatesView: View {
    @EnvironmentObject var app: AppModel
    @State private var tag: String?
    @State private var blankShape: PageShape = .square

    private var visible: [Template] {
        guard let tag else { return Templates.shared.all }
        return Templates.shared.all.filter { $0.tagKey == tag }
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            Text(Localized.s("templates.intro"))
                .font(.ehUI(12.5, .medium))
                .foregroundStyle(Color.ehMuted)
                .lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 18)
                .padding(.bottom, 6)
            filters
            ScrollView {
                VStack(spacing: 14) {
                    ForEach(visible, id: \.id) { template in
                        TemplateCard(
                            template: template,
                            blankShape: $blankShape,
                            onUse: {
                                app.startBook(
                                    from: template,
                                    shape: template.shapeIsUserChosen ? blankShape : nil
                                )
                            }
                        )
                    }
                }
                .padding(.horizontal, 18)
                .padding(.bottom, 60)
            }
        }
        .background(Color.ehBg)
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

    private var filters: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 7) {
                Chip(title: Localized.s("tag.all"), selected: tag == nil) { tag = nil }
                ForEach(["tag.creatures", "tag.adventure", "tag.magic", "tag.everyday", "tag.free"],
                        id: \.self) { key in
                    Chip(title: Localized.s(key), selected: tag == key) { tag = key }
                }
            }
            .padding(.horizontal, 18)
        }
        .padding(.bottom, 10)
    }
}

private struct TemplateCard: View {
    let template: Template
    @SwiftUI.Binding var blankShape: PageShape
    let onUse: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            previews
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(Localized.s(template.nameKey))
                    .font(.ehUI(17, .black))
                    .foregroundStyle(Color.ehText)
                Text(Localized.s("book.pages", template.pageCount))
                    .font(.ehUI(11.5, .medium))
                    .foregroundStyle(Color.ehMuted)
            }
            Text(Localized.s(template.descKey))
                .font(.ehUI(12.5, .medium))
                .foregroundStyle(Color.ehMuted)
                .lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: 6) {
                tag(Localized.s(template.tagKey), fg: .ehAccentDeep, bg: .ehAccentTint)
                tag(Localized.shapeName(template.shape), fg: .ehAccent2Deep, bg: .ehAccent2Tint)
                if !template.pages.isEmpty {
                    tag(Localized.s("templates.hintIncluded"), fg: .ehMuted, bg: .ehSurface)
                }
            }

            if template.shapeIsUserChosen {
                shapePicker
            }

            PillButton(title: Localized.s("home.newBook"), filled: true, big: true, action: onUse)
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 28).fill(Color.ehSunken))
        .ehElevation(1)
    }

    /// The first three pages, at the template's own aspect ratio.
    private var previews: some View {
        HStack(spacing: 8) {
            ForEach(Array(template.pages.prefix(3).enumerated()), id: \.offset) { index, _ in
                TemplatePagePreview(
                    template: template,
                    pageIndex: index,
                    shape: template.shapeIsUserChosen ? blankShape : template.shape
                )
            }
            if template.pages.count < 3 {
                ForEach(0..<(3 - template.pages.count), id: \.self) { _ in
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color(template.background.uiColor))
                        .aspectRatio(
                            CGFloat(template.shapeIsUserChosen ? blankShape.aspect : template.shape.aspect),
                            contentMode: .fit
                        )
                        .frame(maxWidth: .infinity)
                }
            }
        }
    }

    private var shapePicker: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(Localized.s("shape.pick"))
                .font(.ehUI(11))
                .foregroundStyle(Color.ehMuted)
            HStack(spacing: 6) {
                shapeChip(.square)
                shapeChip(.landscape)
                shapeChip(.portrait)
            }
        }
    }

    private func shapeChip(_ shape: PageShape) -> some View {
        Chip(title: Localized.shapeName(shape), selected: blankShape == shape) {
            blankShape = shape
        }
    }

    private func tag(_ title: String, fg: Color, bg: Color) -> some View {
        Text(title)
            .font(.ehUI(11))
            .foregroundStyle(fg)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(Capsule().fill(bg))
    }
}

/// Instantiates the template to render a true preview, rather than faking one.
private struct TemplatePagePreview: View {
    let template: Template
    let pageIndex: Int
    let shape: PageShape

    private static let builder = SceneBuilder(measurer: UIKitTextMeasurer())
    private static let painter = ScenePainter()

    var body: some View {
        GeometryReader { geo in
            let book = Templates.shared.instantiate(
                template: template,
                bookId: BookId(value: "preview-\(template.id)"),
                title: "",
                contentLocale: "ja-JP",
                nowEpochMs: 0,
                shapeOverride: shape,
                idSource: IdSource(prefix: "p")
            )
            let target = RenderTarget.Companion.shared.screen(
                shape: book.shape,
                available: Size(w: Float(max(geo.size.width, 1)), h: Float(max(geo.size.height, 1))),
                selectedItem: nil
            )
            let scene = Self.builder.build(
                page: book.page(index: Int32(pageIndex)), target: target, promptText: nil
            )
            Canvas { ctx, _ in
                ctx.withCGContext { Self.painter.draw(scene, into: $0) }
            }
            .frame(width: CGFloat(scene.size.w), height: CGFloat(scene.size.h))
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .aspectRatio(CGFloat(shape.aspect), contentMode: .fit)
        .background(Color(template.background.uiColor))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .ehElevation(0)
        .frame(maxWidth: .infinity)
    }
}
