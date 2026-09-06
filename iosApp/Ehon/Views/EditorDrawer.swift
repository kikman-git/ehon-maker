import SwiftUI
import EhonCore

/// The drawer below the mode bar: parts or crayons, matching the current mode.
///
/// It pushes the page up rather than floating over it — that is the 1a trade: a smaller
/// canvas in exchange for tools and drawing surface that never overlap. もじ is the one
/// exception (2a): its card floats *above* the drawer, so the page keeps its size while
/// the font row is open.
struct EditorDrawer: View {
    @ObservedObject var model: EditorModel
    let bigTargets: Bool

    /// From the prototype: 214pt normally, 232pt with bigger targets.
    static func height(bigTargets: Bool) -> CGFloat { bigTargets ? 232 : 214 }

    var body: some View {
        VStack(spacing: 0) {
            switch model.mode {
            case .draw: DrawPanel(model: model)
            default: StickPanel(model: model)
            }
        }
        .frame(height: Self.height(bigTargets: bigTargets))
        .frame(maxWidth: .infinity)
        .background(
            UnevenRoundedRectangle(topLeadingRadius: 28, topTrailingRadius: 28)
                .fill(Color.ehSunken)
        )
        .shadow(color: Color.ehInk.opacity(0.1), radius: 10, y: -3)
    }
}

// MARK: - はる

private struct StickPanel: View {
    @ObservedObject var model: EditorModel

    private var parts: [Part] {
        PartCatalog.shared.inCategory(category: model.controller.category)
    }

    var body: some View {
        VStack(spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(PartCatalog.shared.categories, id: \.self) { category in
                        Chip(title: Localized.categoryName(category),
                             selected: category == model.controller.category) {
                            model.apply { $0.setCategory(next: category) }
                        }
                    }
                }
                .padding(.horizontal, 14)
            }
            .padding(.top, 12)
            .padding(.bottom, 10)

            ScrollView {
                LazyVGrid(columns: Array(repeating: GridItem(spacing: 9), count: 5), spacing: 9) {
                    ForEach(parts, id: \.id.value) { part in
                        PartTile(part: part) {
                            model.apply { $0.addPart(partId: part.id) }
                        }
                    }
                }
                .padding(.horizontal, 14)

                VStack(alignment: .leading, spacing: 7) {
                    Text(Localized.s("editor.backgroundColour"))
                        .font(.ehUI(11))
                        .foregroundStyle(Color.ehMuted)
                    HStack(spacing: 8) {
                        ForEach(0..<Int(Organic.shared.pageBackgroundCount), id: \.self) { index in
                            let colour = Organic.shared.pageBackground(index: Int32(index))
                            Button {
                                model.apply { $0.setPageBackground(color: colour) }
                            } label: {
                                Circle()
                                    .fill(Color(colour.uiColor))
                                    .frame(width: 34, height: 34)
                                    .overlay(Circle().strokeBorder(Color.ehInk.opacity(0.1), lineWidth: 1))
                                    .overlay(
                                        Circle().strokeBorder(
                                            model.page.background == colour ? Color.ehAccent : .clear,
                                            lineWidth: 2.5
                                        ).padding(-4)
                                    )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 14)
                .padding(.top, 12)
                .padding(.bottom, 10)
            }
        }
    }
}

/// One part in the drawer, drawn through the same painter as the page itself — so the tile
/// is a true preview rather than a separate icon that can drift.
struct PartTile: View {
    let part: Part
    let action: () -> Void

    @Environment(\.displayScale) private var displayScale

    var body: some View {
        Button(action: action) {
            VStack(spacing: 2) {
                GeometryReader { geo in
                    let side = max(min(geo.size.width, geo.size.height), 1)
                    Image(uiImage: PartTileCache.image(for: part, side: side, scale: displayScale))
                        .resizable()
                        .frame(width: side, height: side)
                        .frame(width: geo.size.width, height: geo.size.height)
                }
                .aspectRatio(1, contentMode: .fit)

                Text(Localized.partName(part))
                    .font(.ehUI(9))
                    .foregroundStyle(Color.ehMuted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .padding(7)
            .background(RoundedRectangle(cornerRadius: 16).fill(Color.ehSurface))
            .ehElevation(0)
        }
        .buttonStyle(.plain)
    }
}

/// Parts never change, so a tile is painted once per size; repainting every visible tile on each revision stalled phones.
@MainActor
private enum PartTileCache {
    private static var images: [String: UIImage] = [:]
    private static let builder = SceneBuilder(measurer: UIKitTextMeasurer())

    static func image(for part: Part, side: CGFloat, scale: CGFloat) -> UIImage {
        let key = "\(part.id.value)@\(Int(side.rounded()))@\(scale)"
        if let cached = images[key] { return cached }
        let page = Page.companion.of(
            background: Organic.shared.surface,
            promptKey: nil,
            items: [PartItem(id: ItemId(value: "tile"), x: 50, y: 50, rotationDeg: 0, partId: part.id, sizePct: 96)],
            strokes: []
        )
        let target = RenderTarget.Companion.shared.screen(
            shape: .square, available: Size(w: Float(side), h: Float(side)), selectedItem: nil
        )
        let image = SceneRenderer.image(builder.build(page: page, target: target, promptText: nil), scale: scale)
        images[key] = image
        return image
    }
}

// MARK: - かく

private struct DrawPanel: View {
    @ObservedObject var model: EditorModel

    var body: some View {
        VStack(spacing: 10) {
            // 7 × 2: 原色 above, the same hues as パステル below. The drawing palette, not
            // the part ramp — see Organic.drawingCrayons.
            let columns = Int(Organic.shared.DRAWING_CRAYON_COLUMNS)
            LazyVGrid(columns: Array(repeating: GridItem(spacing: 6), count: columns), spacing: 8) {
                ForEach(0..<Int(Organic.shared.drawingCrayonCount), id: \.self) { index in
                    let colour = Organic.shared.drawingCrayon(index: Int32(index))
                    Button {
                        model.apply { $0.setCrayon(index: Int32(index)) }
                    } label: {
                        Circle()
                            .fill(Color(colour.uiColor))
                            .aspectRatio(1, contentMode: .fit)
                            .frame(maxWidth: .infinity)
                            .overlay(Circle().strokeBorder(Color.ehInk.opacity(0.12), lineWidth: 1))
                            .overlay(
                                Circle().strokeBorder(
                                    Int(model.controller.crayonIndex) == index && !model.controller.eraser
                                        ? Color.ehInk : .clear,
                                    lineWidth: 3
                                ).padding(-3)
                            )
                    }
                    .buttonStyle(.plain)
                }
            }

            HStack(spacing: 10) {
                ForEach(1...3, id: \.self) { step in
                    Button {
                        model.apply { $0.setBrush(step: Int32(step)) }
                    } label: {
                        Circle()
                            .fill(Color.ehInk)
                            .frame(width: CGFloat(6 + step * 5), height: CGFloat(6 + step * 5))
                            .frame(width: 52, height: 44)
                            .background(
                                RoundedRectangle(cornerRadius: 16).fill(
                                    Int(model.controller.brushStep) == step && !model.controller.eraser
                                        ? Color.ehEdge : Color.ehSurface
                                )
                            )
                    }
                    .buttonStyle(.plain)
                }
                Spacer(minLength: 6)
                Button {
                    model.apply { $0.toggleEraser() }
                } label: {
                    Text(Localized.s("draw.eraser"))
                        .font(.ehUI(13))
                        .foregroundStyle(model.controller.eraser ? Color.ehSurface : .ehMuted)
                        .padding(.horizontal, 15)
                        .frame(height: 44)
                        .background(Capsule().fill(model.controller.eraser ? Color.ehInk : Color.ehSurface))
                }
                .buttonStyle(.plain)
            }

            HStack(spacing: 9) {
                PillButton(title: Localized.s("draw.undo"), tinted: true) {
                    model.apply { $0.undo() }
                }
                .disabled(!model.canUndo)
                .opacity(model.canUndo ? 1 : 0.45)

                // Hold-to-confirm rather than a tap: undo covers this, but a destructive
                // tap target next to a drawing surface is a bad idea regardless.
                HoldToConfirmButton(title: Localized.s("draw.clearAll")) {
                    model.apply { $0.clearStrokes() }
                }
            }

            Text(Localized.s("draw.hint"))
                .font(.ehUI(11, .medium))
                .foregroundStyle(Color.ehMuted)
                .lineSpacing(2)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 12)
    }
}

/// Requires a short press rather than a tap. Long enough that a stray finger can't wipe the
/// page, short enough not to feel like a penalty — undo covers the deliberate case anyway.
private struct HoldToConfirmButton: View {
    let title: String
    let action: () -> Void

    private static let holdDuration: Double = 0.6

    @State private var progress: CGFloat = 0
    @State private var task: Task<Void, Never>?

    var body: some View {
        ZStack {
            Capsule().strokeBorder(Color.ehEdge, lineWidth: 1)
            GeometryReader { geo in
                Capsule()
                    .fill(Color.ehAccent.opacity(0.28))
                    .frame(width: geo.size.width * progress)
            }
            .clipShape(Capsule())
            Text(title)
                .font(.ehUI(13.5))
                .foregroundStyle(Color.ehMuted)
        }
        .frame(height: 46)
        .frame(maxWidth: .infinity)
        .contentShape(Capsule())
        .onLongPressGesture(minimumDuration: Self.holdDuration, maximumDistance: 30) {
            progress = 0
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            action()
        } onPressingChanged: { pressing in
            task?.cancel()
            if pressing {
                // The fill tracks the real threshold, so the bar reaching the end is the
                // moment it fires rather than an unrelated animation.
                task = Task { @MainActor in
                    let steps = 20
                    let tick = Self.holdDuration / Double(steps)
                    for step in 0...steps {
                        guard !Task.isCancelled else { return }
                        progress = CGFloat(step) / CGFloat(steps)
                        try? await Task.sleep(for: .seconds(tick))
                    }
                }
            } else {
                withAnimation(.easeOut(duration: 0.12)) { progress = 0 }
            }
        }
    }
}

// MARK: - もじ

struct TextPanel: View {
    @ObservedObject var model: EditorModel
    @FocusState private var focused: Bool

    private var currentText: String {
        (model.controller.selected as? TextItem)?.text ?? model.controller.draftText
    }

    private var currentRuby: String {
        (model.controller.selected as? TextItem)?.ruby ?? model.controller.draftRuby
    }

    var body: some View {
        VStack(spacing: 10) {
            TextField(
                Localized.s("text.placeholder"),
                text: Binding(
                    get: { currentText },
                    set: { value in model.apply { $0.setDraftText(value: value) } }
                )
            )
            .font(.ehBody(15))
            // A TextField inherits .primary, which is white in dark mode — invisible on
            // Organic's cream capsule. Every colour here is a fixed light-paper token.
            .foregroundStyle(Color.ehText)
            .tint(Color.ehAccent)
            .focused($focused)
            .padding(.horizontal, 18)
            .frame(height: 48)
            .background(Capsule().fill(Color.ehSurface))
            .overlay(Capsule().strokeBorder(Color.ehEdge, lineWidth: 1))

            // Furigana exists only for a Japanese book — decision #9's locale conditional.
            if model.controller.showFuriganaField {
                TextField(
                    Localized.s("text.rubyPlaceholder"),
                    text: Binding(
                        get: { currentRuby },
                        set: { value in model.apply { $0.setDraftRuby(value: value) } }
                    )
                )
                .font(.ehUI(13, .medium))
                .foregroundStyle(Color.ehText)
                .tint(Color.ehAccent)
                .padding(.horizontal, 18)
                .frame(height: 42)
                .overlay(
                    Capsule().strokeBorder(
                        Color.ehEdge, style: StrokeStyle(lineWidth: 1, dash: [4, 3])
                    )
                )
            }

            FontPicker(model: model)

            HStack(spacing: 9) {
                ForEach(1...3, id: \.self) { step in
                    Button {
                        model.apply { $0.setTextSize(step: Int32(step)) }
                    } label: {
                        Text("あ")
                            .font(.ehBody(CGFloat(12 + step * 4)))
                            .foregroundStyle(
                                Int(model.controller.textSizeStep) == step ? Color.ehSurface : .ehMuted
                            )
                            .frame(width: 46, height: 44)
                            .background(
                                RoundedRectangle(cornerRadius: 16).fill(
                                    Int(model.controller.textSizeStep) == step ? Color.ehInk : Color.ehSurface
                                )
                            )
                    }
                    .buttonStyle(.plain)
                }
                Spacer(minLength: 6)
                if model.book.isJapanese {
                    Button {
                        model.apply { $0.toggleFurigana() }
                    } label: {
                        Text(Localized.s("text.ruby"))
                            .font(.ehUI(13))
                            .foregroundStyle(
                                model.controller.furiganaEnabled ? Color.ehSurface : .ehMuted
                            )
                            .padding(.horizontal, 15)
                            .frame(height: 44)
                            .background(
                                Capsule().fill(
                                    model.controller.furiganaEnabled ? Color.ehInk : Color.ehSurface
                                )
                            )
                    }
                    .buttonStyle(.plain)
                }
            }

            HStack(spacing: 8) {
                ForEach(0..<5, id: \.self) { index in
                    let colour = Organic.shared.textColor(index: Int32(index))
                    Button {
                        model.apply { $0.setTextColour(index: Int32(index)) }
                    } label: {
                        Circle()
                            .fill(Color(colour.uiColor))
                            .frame(width: 32, height: 32)
                            .overlay(Circle().strokeBorder(Color.ehInk.opacity(0.12), lineWidth: 1))
                            .overlay(
                                Circle().strokeBorder(
                                    Int(model.controller.textColorIndex) == index
                                        ? Color.ehInk : .clear,
                                    lineWidth: 2.5
                                ).padding(-4)
                            )
                    }
                    .buttonStyle(.plain)
                }
                Spacer(minLength: 6)
                Button {
                    focused = false
                    model.apply { _ = $0.commitText() }
                } label: {
                    Text(model.controller.isTextSelected
                         ? Localized.s("text.done") : Localized.s("text.commit"))
                        .font(.ehUI(14))
                        .foregroundStyle(Color.ehSurface)
                        .padding(.horizontal, 20)
                        .frame(height: 44)
                        .background(Capsule().fill(Color.ehAccent))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 12)
    }
}


/// てがき・まるまる・えほん・ぽっぷ・マーカー・ふとまる. Each card is drawn in its own face,
/// so the picker is a true preview. Only てがき ships in the app; tapping another face
/// starts its download and applies it at once — text lays out in Yomogi until the file
/// lands, then repaints. Decision 2a, with the user's "download on select".
struct FontPicker: View {
    @ObservedObject var model: EditorModel
    @ObservedObject private var library = FontLibrary.shared

    private var faces: [FontFace] { FontFace.companion.selectable }


    var body: some View {
        HStack(spacing: 6) {
            ForEach(faces, id: \.id) { face in
                let selected = model.controller.fontFace == face
                let state = library.state(of: face)
                Button {
                    library.download(face)
                    model.apply { $0.setFont(face: face) }
                } label: {
                    VStack(spacing: 2) {
                        ZStack {
                            Text("あ")
                                .font(Font(EhonFonts.font(for: face, size: 19)))
                                .opacity(state == .downloading ? 0.25 : 1)
                            if state == .downloading {
                                ProgressView().controlSize(.mini).tint(selected ? Color.ehSurface : .ehAccent)
                            }
                        }
                        .frame(height: 22)
                        Text(state == .failed ? Localized.s("font.downloadFailed") : Localized.fontName(face))
                            .font(.ehUI(8.5, .medium))
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                            .opacity(0.75)
                        if !face.bundled && state == .missing {
                            Image(systemName: "arrow.down.circle")
                                .font(.system(size: 8, weight: .bold))
                                .opacity(0.55)
                        }
                    }
                    .foregroundStyle(selected ? Color.ehSurface : .ehText)
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
                    .background(RoundedRectangle(cornerRadius: 14).fill(selected ? Color.ehInk : Color.ehSurface))
                }
                .buttonStyle(.plain)
            }
        }
    }
}


/// もじを いれる — the 2a text card. Floats above the drawer at a fixed offset so the
/// composition underneath never jumps when the font row appears.
struct TextCard: View {
    @ObservedObject var model: EditorModel

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text(Localized.s("text.panelTitle"))
                    .font(.ehUI(13, .black))
                    .foregroundStyle(Color.ehText)
                Spacer()
                Button {
                    model.apply { $0.setMode(next: .stick) }
                } label: {
                    Text(Localized.s("text.close"))
                        .font(.ehUI(12.5))
                        .foregroundStyle(Color.ehMuted)
                        .padding(.horizontal, 13)
                        .frame(height: 34)
                        .background(Capsule().fill(Color.ehSurface))
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 16)
            .padding(.top, 14)
            TextPanel(model: model)
        }
        .background(RoundedRectangle(cornerRadius: 28).fill(Color.ehSunken))
        .ehElevation(2)
    }
}
