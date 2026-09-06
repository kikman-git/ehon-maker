import SwiftUI
import EhonCore

/// iPad — たてもち で つくる / よこもち で よむ. Decision 3a.
///
/// Orientation picks the default: portrait is the making layout (a big page, tools on a
/// rail along the bottom, so parent and child sit side by side), landscape is the shared
/// two-page `ReadView`. よむ / つくる switch explicitly; asking to make while landscape shows
/// the 「たてに むけて」 card instead of cramming the rail in.
struct TabletRootView: View {
    @EnvironmentObject var app: AppModel
    @ObservedObject var model: EditorModel
    var startReading = false
    var startPage = 0

    private enum Mode { case auto, make, read }
    @State private var mode: Mode = .auto
    @State private var readIndex = 0
    @State private var rotateHint = false

    var body: some View {
        GeometryReader { geo in
            let landscape = geo.size.width > geo.size.height
            let reading = mode == .read || (mode == .auto && landscape)
            ZStack {
                if reading {
                    ReadView(book: model.book, startPage: readIndex) {
                        if landscape {
                            // Hand control back to the device: once it is upright, .auto
                            // resolves to make, which is what the card promises.
                            rotateHint = true
                            mode = .auto
                        } else {
                            mode = .make
                        }
                    }
                } else {
                    TabletEditorView(model: model) {
                        readIndex = model.pageIndex
                        mode = .read
                    }
                }
                if rotateHint {
                    RotateHint { rotateHint = false }
                }
            }
            .animation(.easeOut(duration: 0.2), value: reading)
        }
        .onAppear {
            if startReading { mode = .read; readIndex = startPage }
        }
    }
}

// MARK: - たてもち · つくる

struct TabletEditorView: View {
    @EnvironmentObject var app: AppModel
    @ObservedObject var model: EditorModel
    let onRead: () -> Void

    private var railHeight: CGFloat { model.mode == .draw ? 330 : 352 }

    var body: some View {
        VStack(spacing: 0) {
            header
            thumbnails
            EditorPage(model: model)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding(.horizontal, 34)
                .padding(.vertical, 6)
            rail
        }
        .background(Color.ehBg)
        .overlay(alignment: .bottom) {
            if model.mode == .text {
                TabletTextCard(model: model)
                    .padding(.bottom, railHeight + 20)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .overlay(alignment: .bottom) {
            if let toast = model.toastText {
                ToastView(text: toast).padding(.bottom, railHeight + 40)
            }
        }
        .animation(.easeOut(duration: 0.18), value: model.mode)
        .animation(.easeOut(duration: 0.2), value: model.toastText)
    }

    private var header: some View {
        HStack(spacing: 16) {
            CircleIconButton(systemName: "arrow.left", diameter: 48) {
                model.saveNow()
                app.openShelf()
            }
            VStack(alignment: .leading, spacing: 1) {
                Text(Localized.s("tablet.makeTogether"))
                    .font(.ehUI(12.5)).foregroundStyle(Color.ehAccentDeep)
                Text(model.book.title)
                    .font(.ehUI(28, .black)).foregroundStyle(Color.ehText)
                    .lineLimit(1).truncationMode(.tail)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .layoutPriority(-1)
            Text(Localized.s("editor.pageLabel", model.pageIndex + 1, model.book.pageCount))
                .font(.ehUI(14, .medium)).foregroundStyle(Color.ehMuted)
            uiLevelPills
            PillButton(title: Localized.s("editor.read"), tinted: true, big: true, action: onRead)
                .fixedSize()
            PillButton(title: Localized.s("editor.done"), filled: true, big: true) {
                app.openDone(model.book)
            }
            .fixedSize()
        }
        .padding(.horizontal, 34)
        .padding(.top, 14)
        .padding(.bottom, 8)
    }

    /// こども / おとな as a segmented pill, per the tablet spec.
    private var uiLevelPills: some View {
        HStack(spacing: 4) {
            ForEach([UiLevel.kid, UiLevel.adult], id: \.self) { level in
                let on = app.uiLevel == level
                Button { app.uiLevel = level } label: {
                    Text(Localized.s(level == .adult ? "ui.adult" : "ui.kid"))
                        .font(.ehUI(15.5))
                        .foregroundStyle(on ? Color.ehSurface : .ehMuted)
                        .padding(.horizontal, 22)
                        .frame(height: 46)
                        .background(Capsule().fill(on ? Color.ehInk : .clear))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(5)
        .background(Capsule().fill(Color.ehSunken))
    }

    private var thumbnails: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(0..<Int(model.book.pageCount), id: \.self) { index in
                    TabletThumb(book: model.book, index: index, selected: index == model.pageIndex) {
                        model.apply { $0.goToPage(index: Int32(index)) }
                    }
                    .equatable()
                    .pageReorderable(model: model, index: index, cornerRadius: 12)
                }
                Button { model.apply { $0.addPage() } } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundStyle(Color.ehMuted)
                        .frame(width: 52, height: 72)
                        .overlay(RoundedRectangle(cornerRadius: 12)
                            .strokeBorder(Color.ehEdge, style: StrokeStyle(lineWidth: 2.5, dash: [5, 4])))
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 34)
            .padding(.vertical, 6)
        }
    }

    // MARK: rail

    private var rail: some View {
        VStack(spacing: 0) {
            HStack(spacing: 14) {
                modePills
                if model.mode == .draw { drawControls } else { categoryChips }
            }
            .padding(.horizontal, 30)
            .padding(.top, 16)
            .padding(.bottom, 12)

            if model.mode == .draw { drawPalette } else { partGrid }
        }
        .frame(height: railHeight)
        .frame(maxWidth: .infinity)
        .background(UnevenRoundedRectangle(topLeadingRadius: 34, topTrailingRadius: 34).fill(Color.ehSunken))
        .shadow(color: Color.ehInk.opacity(0.1), radius: 10, y: -3)
    }

    private var modePills: some View {
        HStack(spacing: 5) {
            modePill(.stick, "mode.stick", "mode.stick.sub")
            modePill(.draw, "mode.draw", "mode.draw.sub")
            modePill(.text, "mode.text", "mode.text.sub")
        }
        .padding(5)
        .background(Capsule().fill(Color.ehSurface))
    }

    private func modePill(_ m: EditorMode, _ title: String, _ sub: String) -> some View {
        let on = model.mode == m
        return Button { model.apply { $0.setMode(next: m) } } label: {
            VStack(spacing: 1) {
                Text(Localized.s(title)).font(.ehUI(16))
                Text(Localized.s(sub)).font(.ehUI(10.5, .medium)).opacity(0.72)
            }
            .foregroundStyle(on ? Color.ehSurface : .ehMuted)
            .padding(.horizontal, 26)
            .frame(height: 52)
            .background(Capsule().fill(on ? Color.ehInk : .clear))
        }
        .buttonStyle(.plain)
    }

    private var categoryChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(PartCatalog.shared.categories, id: \.self) { category in
                    let on = category == model.controller.category
                    Button { model.apply { $0.setCategory(next: category) } } label: {
                        Text(Localized.categoryName(category))
                            .font(.ehUI(14))
                            .foregroundStyle(on ? Color.ehSurface : .ehMuted)
                            .padding(.horizontal, 18)
                            .frame(height: 44)
                            .background(Capsule().fill(on ? Color.ehInk : Color.ehSurface))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var partGrid: some View {
        ScrollView {
            LazyVGrid(columns: Array(repeating: GridItem(spacing: 14), count: 8), spacing: 14) {
                ForEach(PartCatalog.shared.inCategory(category: model.controller.category), id: \.id.value) { part in
                    PartTile(part: part) { model.apply { $0.addPart(partId: part.id) } }
                }
            }
            .padding(.horizontal, 30)

            VStack(alignment: .leading, spacing: 9) {
                Text(Localized.s("editor.backgroundColour")).font(.ehUI(12.5)).foregroundStyle(Color.ehMuted)
                HStack(spacing: 11) {
                    ForEach(0..<Int(Organic.shared.pageBackgroundCount), id: \.self) { index in
                        let colour = Organic.shared.pageBackground(index: Int32(index))
                        Button { model.apply { $0.setPageBackground(color: colour) } } label: {
                            Circle().fill(Color(colour.uiColor))
                                .frame(width: 46, height: 46)
                                .overlay(Circle().strokeBorder(Color.ehInk.opacity(0.1), lineWidth: 1))
                                .overlay(Circle().strokeBorder(
                                    model.page.background == colour ? Color.ehAccent : .clear, lineWidth: 3
                                ).padding(-4))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 30)
            .padding(.top, 18)
            .padding(.bottom, 18)
        }
    }

    private var drawControls: some View {
        HStack(spacing: 12) {
            Spacer()
            ForEach(1...3, id: \.self) { step in
                let on = Int(model.controller.brushStep) == step && !model.controller.eraser
                Button { model.apply { $0.setBrush(step: Int32(step)) } } label: {
                    Circle().fill(Color.ehInk)
                        .frame(width: CGFloat(8 + step * 6), height: CGFloat(8 + step * 6))
                        .frame(width: 64, height: 52)
                        .background(RoundedRectangle(cornerRadius: 18).fill(on ? Color.ehEdge : Color.ehSurface))
                }
                .buttonStyle(.plain)
            }
            railButton(Localized.s("draw.eraser"), filled: model.controller.eraser) { model.apply { $0.toggleEraser() } }
            railButton(Localized.s("draw.undo"), filled: false) { model.apply { $0.undo() } }
                .disabled(!model.canUndo).opacity(model.canUndo ? 1 : 0.45)
            Button { model.apply { $0.clearStrokes() } } label: {
                Text(Localized.s("draw.clearAll")).font(.ehUI(15)).foregroundStyle(Color.ehMuted)
                    .padding(.horizontal, 20).frame(height: 52)
                    .overlay(Capsule().strokeBorder(Color.ehEdge, lineWidth: 1))
            }
            .buttonStyle(.plain)
        }
    }

    private func railButton(_ title: String, filled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).font(.ehUI(15))
                .foregroundStyle(filled ? Color.ehSurface : .ehText)
                .padding(.horizontal, 20).frame(height: 52)
                .background(Capsule().fill(filled ? Color.ehInk : Color.ehSurface))
        }
        .buttonStyle(.plain)
    }

    private var drawPalette: some View {
        VStack(alignment: .leading, spacing: 16) {
            LazyVGrid(columns: Array(repeating: GridItem(spacing: 14), count: Int(Organic.shared.DRAWING_CRAYON_COLUMNS)), spacing: 14) {
                ForEach(0..<Int(Organic.shared.drawingCrayonCount), id: \.self) { index in
                    let colour = Organic.shared.drawingCrayon(index: Int32(index))
                    let on = Int(model.controller.crayonIndex) == index && !model.controller.eraser
                    Button { model.apply { $0.setCrayon(index: Int32(index)) } } label: {
                        Circle().fill(Color(colour.uiColor))
                            .frame(width: 56, height: 56)
                            .overlay(Circle().strokeBorder(Color.ehInk.opacity(0.12), lineWidth: 1))
                            .overlay(Circle().strokeBorder(on ? Color.ehInk : .clear, lineWidth: 3.5).padding(-4))
                    }
                    .buttonStyle(.plain)
                }
            }
            Text(Localized.s("tablet.drawHint"))
                .font(.ehUI(12.5, .medium)).foregroundStyle(Color.ehMuted).lineSpacing(3)
        }
        .padding(.horizontal, 30)
        .padding(.top, 4)
        .padding(.bottom, 18)
    }
}

/// もじを いれる — floats above the rail rather than living in it. Same intents as the
/// phone's TextPanel; only the arrangement differs.
private struct TabletTextCard: View {
    @ObservedObject var model: EditorModel
    @FocusState private var focused: Bool

    private var currentText: String { (model.controller.selected as? TextItem)?.text ?? model.controller.draftText }
    private var currentRuby: String { (model.controller.selected as? TextItem)?.ruby ?? model.controller.draftRuby }

    var body: some View {
        VStack(spacing: 12) {
            HStack {
                Text(Localized.s("tablet.textCardTitle")).font(.ehUI(15, .black)).foregroundStyle(Color.ehText)
                Spacer()
                Button { model.apply { $0.setMode(next: .stick) } } label: {
                    Text(Localized.s("text.close")).font(.ehUI(14)).foregroundStyle(Color.ehMuted)
                        .padding(.horizontal, 16).frame(height: 40)
                        .background(Capsule().fill(Color.ehSurface))
                }
                .buttonStyle(.plain)
            }
            TextField(Localized.s("text.placeholder"), text: Binding(
                get: { currentText }, set: { v in model.apply { $0.setDraftText(value: v) } }))
                .font(.ehBody(18))
                .foregroundStyle(Color.ehText).tint(Color.ehAccent)
                .focused($focused)
                .padding(.horizontal, 22).frame(height: 56)
                .background(Capsule().fill(Color.ehSurface))
                .overlay(Capsule().strokeBorder(Color.ehEdge, lineWidth: 1))
            if model.controller.showFuriganaField {
                TextField(Localized.s("text.rubyPlaceholder"), text: Binding(
                    get: { currentRuby }, set: { v in model.apply { $0.setDraftRuby(value: v) } }))
                    .font(.ehUI(15, .medium))
                    .foregroundStyle(Color.ehText).tint(Color.ehAccent)
                    .padding(.horizontal, 22).frame(height: 48)
                    .overlay(Capsule().strokeBorder(Color.ehEdge, style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
            }
            FontPicker(model: model)
            HStack(spacing: 10) {
                ForEach(1...3, id: \.self) { step in
                    let on = Int(model.controller.textSizeStep) == step
                    Button { model.apply { $0.setTextSize(step: Int32(step)) } } label: {
                        Text("あ").font(.ehBody(CGFloat(15 + step * 5)))
                            .foregroundStyle(on ? Color.ehSurface : .ehMuted)
                            .frame(width: 54, height: 50)
                            .background(RoundedRectangle(cornerRadius: 16).fill(on ? Color.ehInk : Color.ehSurface))
                    }
                    .buttonStyle(.plain)
                }
                Spacer().frame(width: 10)
                ForEach(0..<5, id: \.self) { index in
                    let colour = Organic.shared.textColor(index: Int32(index))
                    let on = Int(model.controller.textColorIndex) == index
                    Button { model.apply { $0.setTextColour(index: Int32(index)) } } label: {
                        Circle().fill(Color(colour.uiColor)).frame(width: 38, height: 38)
                            .overlay(Circle().strokeBorder(Color.ehInk.opacity(0.12), lineWidth: 1))
                            .overlay(Circle().strokeBorder(on ? Color.ehInk : .clear, lineWidth: 3).padding(-3))
                    }
                    .buttonStyle(.plain)
                }
                Spacer()
            }
            HStack(spacing: 10) {
                if model.isAdult && model.book.isJapanese {
                    Button { model.apply { $0.toggleFurigana() } } label: {
                        Text(Localized.s("text.ruby")).font(.ehUI(14))
                            .foregroundStyle(model.controller.furiganaEnabled ? Color.ehSurface : .ehMuted)
                            .padding(.horizontal, 18).frame(height: 50)
                            .background(Capsule().fill(model.controller.furiganaEnabled ? Color.ehInk : Color.ehSurface))
                    }
                    .buttonStyle(.plain)
                }
                Spacer()
                Button {
                    focused = false
                    model.apply { _ = $0.commitText() }
                } label: {
                    Text(model.controller.isTextSelected ? Localized.s("text.done") : Localized.s("text.commit"))
                        .font(.ehUI(16)).foregroundStyle(Color.ehSurface)
                        .padding(.horizontal, 26).frame(height: 50)
                        .background(Capsule().fill(Color.ehAccent))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(20)
        .frame(width: 660)
        .background(RoundedRectangle(cornerRadius: 28).fill(Color.ehSunken))
        .ehElevation(2)
    }
}

private struct TabletThumb: View, Equatable {
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

    var body: some View {
        Button(action: action) {
            VStack(spacing: 5) {
                GeometryReader { geo in
                    let target = RenderTarget.Companion.shared.screen(
                        shape: book.shape,
                        available: Size(w: Float(max(geo.size.width, 1)), h: Float(max(geo.size.height, 1))),
                        selectedItem: nil)
                    let scene = Self.builder.build(page: book.page(index: Int32(index)), target: target, promptText: nil)
                    Canvas { ctx, _ in ctx.withCGContext { Self.painter.draw(scene, into: $0) } }
                        .frame(width: CGFloat(scene.size.w), height: CGFloat(scene.size.h))
                        .frame(width: geo.size.width, height: geo.size.height)
                }
                .frame(width: 72 * CGFloat(book.shape.aspect), height: 72)
                .background(Color(book.page(index: Int32(index)).background.uiColor))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(
                    selected ? Color.ehAccent : Color.ehInk.opacity(0.12), lineWidth: selected ? 3 : 1))
                Text("\(index + 1)").font(.ehUI(12)).foregroundStyle(selected ? Color.ehAccentDeep : .ehMuted)
            }
        }
        .buttonStyle(.plain)
    }
}

/// たてに むけると つくれます — shown when つくる is asked for while landscape.
private struct RotateHint: View {
    let dismiss: () -> Void

    var body: some View {
        ZStack {
            Color.ehInk.opacity(0.52).ignoresSafeArea().onTapGesture(perform: dismiss)
            VStack(spacing: 10) {
                HStack(spacing: 18) {
                    RoundedRectangle(cornerRadius: 12).strokeBorder(Color.ehAccent, lineWidth: 4).frame(width: 64, height: 88)
                    Image(systemName: "arrow.clockwise").font(.system(size: 30, weight: .bold)).foregroundStyle(Color.ehAccentDeep)
                    RoundedRectangle(cornerRadius: 12).strokeBorder(Color.ehEdge, lineWidth: 4).frame(width: 88, height: 64)
                }
                .padding(.bottom, 12)
                Text(Localized.s("tablet.rotateTitle")).font(.ehUI(22, .black)).foregroundStyle(Color.ehText)
                Text(Localized.s("tablet.rotateBody"))
                    .font(.ehUI(14, .medium)).foregroundStyle(Color.ehMuted).lineSpacing(4)
                    .multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
                PillButton(title: Localized.s("tablet.gotIt"), filled: true, big: true, action: dismiss)
                    .fixedSize().padding(.top, 14)
            }
            .padding(.horizontal, 44).padding(.vertical, 40)
            .frame(maxWidth: 520)
            .background(RoundedRectangle(cornerRadius: 34).fill(Color.ehSurface))
            .ehElevation(2)
        }
        .transition(.opacity)
    }
}
