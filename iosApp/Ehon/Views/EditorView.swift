import SwiftUI
import EhonCore

/// The editor. Model 1a モードきりかえ, exactly as the design chose it.
///
/// Vertical budget on a 402x874 phone: header 114, thumbnails 78, mode bar 68, drawer 214,
/// leaving the page ~322. The page never resizes when the mode changes, because only the
/// drawer's contents vary — a composition that jumped as a child switched tools would be
/// its own bug.
struct EditorView: View {
    @EnvironmentObject var app: AppModel
    @ObservedObject var model: EditorModel

    var body: some View {
        VStack(spacing: 0) {
            header
            thumbnails
            EditorPage(model: model)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding(.vertical, 4)
            modeBar
            EditorDrawer(model: model, bigTargets: app.effectiveBigTargets)
        }
        .background(Color.ehBg)
        .overlay(alignment: .bottom) {
            if model.mode == .text {
                TextCard(model: model)
                    .padding(.horizontal, 14)
                    .padding(.bottom, EditorDrawer.height(bigTargets: app.effectiveBigTargets) + 12)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .overlay(alignment: .bottom) {
            if let toast = model.toastText {
                ToastView(text: toast)
                    .padding(.bottom, EditorDrawer.height(bigTargets: app.effectiveBigTargets) + 24)
            }
        }
        .animation(.easeOut(duration: 0.18), value: model.mode)
        .animation(.easeOut(duration: 0.2), value: model.toastText)
    }

    private var header: some View {
        HStack(spacing: 8) {
            CircleIconButton(systemName: "arrow.left") {
                model.saveNow()
                app.openShelf()
            }
            VStack(alignment: .leading, spacing: 1) {
                Text(model.book.title)
                    .font(.ehUI(15.5, .black))
                    .foregroundStyle(Color.ehText)
                    .lineLimit(1)
                    .truncationMode(.tail)
                Text(Localized.s("editor.pageLabel", model.pageIndex + 1, model.book.pageCount))
                    .font(.ehUI(11, .medium))
                    .foregroundStyle(Color.ehMuted)
                    .lineLimit(1)
            }
            // Compressible: without this the title claims its intrinsic width and shoves
            // よむ / できた off the right edge on a narrower phone.
            .frame(maxWidth: .infinity, alignment: .leading)
            .layoutPriority(-1)
            uiLevelToggle
            PillButton(title: Localized.s("editor.read"), tinted: true) {
                app.openRead(model.book, page: model.pageIndex)
            }
            PillButton(title: Localized.s("editor.done"), filled: true) {
                app.openDone(model.book)
            }
        }
        .padding(.horizontal, 14)
        .padding(.bottom, 6)
    }

    /// こども / おとな — one surface, gated controls (decision #12), never a mode split.
    private var uiLevelToggle: some View {
        let adult = app.uiLevel == .adult
        return Button {
            app.uiLevel = adult ? .kid : .adult
        } label: {
            Text(Localized.s(adult ? "ui.adult" : "ui.kid"))
                .font(.ehUI(12.5))
                .foregroundStyle(adult ? Color.ehSurface : .ehMuted)
                .padding(.horizontal, 12)
                .frame(height: 42)
                .background(Capsule().fill(adult ? Color.ehInk : Color.ehSunken))
        }
        .buttonStyle(.plain)
        .accessibilityHint(Localized.s("ui.adultHint"))
    }

    private var thumbnails: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(0..<Int(model.book.pageCount), id: \.self) { index in
                    PageThumbnail(
                        book: model.book,
                        index: index,
                        selected: index == model.pageIndex
                    ) {
                        model.apply { $0.goToPage(index: Int32(index)) }
                    }
                    .equatable()
                    .pageReorderable(model: model, index: index)
                }
                Button {
                    model.apply { $0.addPage() }
                } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(Color.ehMuted)
                        .frame(width: 36, height: 50)
                        .overlay(
                            RoundedRectangle(cornerRadius: 8).strokeBorder(
                                Color.ehEdge, style: StrokeStyle(lineWidth: 2, dash: [4, 3])
                            )
                        )
                }
                .buttonStyle(.plain)
                .padding(.bottom, 14)
            }
            .padding(.horizontal, 14)
        }
        .frame(height: 78)
    }

    /// はる / かく / もじ. Always visible, never moves — the whole point of model 1a.
    private var modeBar: some View {
        HStack(spacing: 4) {
            modeTab(.stick, "mode.stick", "mode.stick.sub")
            modeTab(.draw, "mode.draw", "mode.draw.sub")
            modeTab(.text, "mode.text", "mode.text.sub")
        }
        .padding(5)
        .background(Capsule().fill(Color.ehSunken))
        .padding(.horizontal, 14)
        .padding(.bottom, 8)
    }

    private func modeTab(_ mode: EditorMode, _ titleKey: String, _ subKey: String) -> some View {
        let active = model.mode == mode
        return Button {
            model.apply { $0.setMode(next: mode) }
        } label: {
            VStack(spacing: 1) {
                Text(Localized.s(titleKey))
                    .font(.ehUI(14.5))
                Text(Localized.s(subKey))
                    .font(.ehUI(9.5, .medium))
                    .opacity(0.7)
            }
            .foregroundStyle(active ? Color.ehSurface : .ehMuted)
            .frame(maxWidth: .infinity)
            .frame(height: app.effectiveBigTargets ? 60 : 50)
            .background(Capsule().fill(active ? Color.ehInk : .clear))
        }
        .buttonStyle(.plain)
    }
}

/// A page in the strip, rendered through the same painter at thumbnail scale.
private struct PageThumbnail: View, Equatable {
    let book: Book
    let index: Int
    let selected: Bool
    let action: () -> Void

    // Only the page that changed repaints: every stroke point bumps the revision.
    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.index == rhs.index && lhs.selected == rhs.selected && lhs.book.shape == rhs.book.shape
            && lhs.book.page(index: Int32(lhs.index)).isEqual(rhs.book.page(index: Int32(rhs.index)))
    }

    private static let builder = SceneBuilder(measurer: UIKitTextMeasurer())
    private static let painter = ScenePainter()

    private var width: CGFloat { 50 * CGFloat(book.shape.aspect) }

    var body: some View {
        Button(action: action) {
            VStack(spacing: 3) {
                GeometryReader { geo in
                    let target = RenderTarget.Companion.shared.screen(
                        shape: book.shape,
                        available: Size(w: Float(max(geo.size.width, 1)),
                                        h: Float(max(geo.size.height, 1))),
                        selectedItem: nil
                    )
                    let scene = Self.builder.build(
                        page: book.page(index: Int32(index)), target: target, promptText: nil
                    )
                    Canvas { ctx, _ in
                        ctx.withCGContext { Self.painter.draw(scene, into: $0) }
                    }
                    .frame(width: CGFloat(scene.size.w), height: CGFloat(scene.size.h))
                    .frame(width: geo.size.width, height: geo.size.height)
                }
                .frame(width: width, height: 50)
                .background(Color(book.page(index: Int32(index)).background.uiColor))
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .overlay(
                    RoundedRectangle(cornerRadius: 8).strokeBorder(
                        selected ? Color.ehAccent : Color.ehInk.opacity(0.12),
                        lineWidth: selected ? 2.5 : 1
                    )
                )

                Text("\(index + 1)")
                    .font(.ehUI(10))
                    .foregroundStyle(selected ? Color.ehAccentDeep : .ehMuted)
            }
        }
        .buttonStyle(.plain)
    }
}
