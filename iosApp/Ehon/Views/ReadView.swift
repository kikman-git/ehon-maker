import SwiftUI
import EhonCore

/// よむ — a two-page spread with the drag-driven 3D fold of decision #6, on every device.
///
/// A picture book is a double-page object: a picture on one leaf, the words on the other.
/// So reading is always the spread and always landscape (`OrientationLock`), and the right
/// leaf folds about the centre spine under the finger — interruptible, rubber-banding back
/// if the turn isn't committed. The margins also turn a spread on tap (decision 3a).
struct ReadView: View {
    @EnvironmentObject var app: AppModel
    @StateObject private var speech = Speech.shared
    @StateObject private var replies = ReplyPlayer.shared

    let book: Book
    /// The tablet supplies its own return; the phone goes back to the editor or the shelf.
    var onBack: (() -> Void)?

    /// Left page of the current spread; always even.
    @State private var index: Int
    @State private var turn: Turn = .idle

    /// おやすみ — bedtime reading: dim, read aloud, turn by itself. Model 2a.
    @State private var night = false
    @State private var nightTask: Task<Void, Never>?
    @State private var toast: String?

    /// From the spec: 7びょう ごとに ひとりで めくります.
    private static let nightInterval: Duration = .seconds(7)

    init(book: Book, startPage: Int, onBack: (() -> Void)? = nil) {
        self.book = book
        self.onBack = onBack
        let n = Int(book.pageCount)
        let even = startPage - startPage % 2
        _index = State(initialValue: max(0, min(even, max(n - 1, 0))))
    }

    /// A turn in flight. `progress` runs 0→1 as the leaf swings through 180°.
    private enum Turn: Equatable {
        case idle
        case forward(CGFloat)
        case backward(CGFloat)

        var progress: CGFloat {
            switch self {
            case .idle: return 0
            case .forward(let p), .backward(let p): return p
            }
        }
    }

    private var pageCount: Int { Int(book.pageCount) }
    private var spread: [Int] { [index, index + 1].filter { $0 < pageCount } }
    private var canForward: Bool { index + 2 < pageCount }
    private var canBackward: Bool { index >= 2 }
    private var spreadReply: PageReply? { spread.compactMap { book.page(index: Int32($0)).reply }.first }

    var body: some View {
        VStack(spacing: 0) {
            topBar
            // Its own row: 「ばあば の こえ · 3.4びょう」 must never truncate to fit beside the title.
            if let reply = spreadReply {
                replyChip(reply).padding(.top, 8)
            }
            GeometryReader { geo in
                // Wide margins are the tap-to-turn zones; a phone gives up less of its width.
                let margin: CGFloat = geo.size.width > 700 ? 110 : 40
                let gap: CGFloat = 4
                let box = Size(w: Float(max((geo.size.width - 2 * margin - gap) / 2, 1)),
                               h: Float(max(geo.size.height - 16, 1)))
                let pageSize = book.shape.fitInto(box: box)
                let size = CGSize(width: CGFloat(pageSize.w), height: CGFloat(pageSize.h))

                ZStack {
                    spreadView(size: size, gap: gap)
                    if night {
                        RadialGradient(
                            colors: [Color.black.opacity(0.26), Color.black.opacity(0.7)],
                            center: .init(x: 0.5, y: 0.45),
                            startRadius: size.width * 0.5, endRadius: size.width * 1.8
                        )
                        .allowsHitTesting(false)
                        .transition(.opacity)
                    }
                }
                .frame(width: geo.size.width, height: geo.size.height)
                .contentShape(Rectangle())
                .gesture(turnGesture(pageWidth: size.width))
                .overlay(alignment: .leading) { turnZone(width: margin) { turn(forward: false) } }
                .overlay(alignment: .trailing) { turnZone(width: margin) { turn(forward: true) } }
            }
            if night {
                Text(Localized.s("read.nightHint"))
                    .font(.ehUI(12))
                    .foregroundStyle(Color.ehBg.opacity(0.6))
                    .padding(.bottom, 6)
            }
            dots
        }
        .background(Color.ehInk)
        .overlay(alignment: .bottom) {
            if let toast { ToastView(text: toast).padding(.bottom, 60) }
        }
        .animation(.easeOut(duration: 0.3), value: night)
        .animation(.easeOut(duration: 0.2), value: toast)
        // よこ＝よむ: the spread only makes sense sideways.
        .onAppear { OrientationLock.set(.landscape) }
        .onDisappear { endNight(); OrientationLock.set(OrientationLock.free) }
    }

    // MARK: - the spread

    /// Two slots about a centre spine. Idle: left = index, right = index + 1. During a turn
    /// the moving leaf shows its front until 90° and its back after, exactly like paper.
    @ViewBuilder
    private func spreadView(size: CGSize, gap: CGFloat) -> some View {
        let leftX = size.width / 2
        let rightX = size.width * 1.5 + gap
        let total = CGSize(width: size.width * 2 + gap, height: size.height)

        ZStack {
            // Beneath: what the turn reveals.
            leaf(beneathLeft, size: size, spine: .trailing)
                .position(x: leftX, y: size.height / 2)
            leaf(beneathRight, size: size, spine: .leading)
                .position(x: rightX, y: size.height / 2)

            // A shadow cast by the lifted leaf, deepest when it is directly overhead.
            Color.black
                .opacity(0.35 * Double(sin(turn.progress * .pi)))
                .frame(width: total.width, height: total.height)
                .clipShape(RoundedRectangle(cornerRadius: 16))
                .allowsHitTesting(false)

            // The moving leaf.
            switch turn {
            case .idle:
                EmptyView()
            case .forward(let p):
                let angle = -180 * Double(p)
                Group {
                    if abs(angle) > 90 {
                        leaf(index + 2 < pageCount ? index + 2 : nil, size: size, spine: .trailing)
                            .rotation3DEffect(.degrees(180), axis: (x: 0, y: 1, z: 0))
                    } else {
                        leaf(index + 1 < pageCount ? index + 1 : nil, size: size, spine: .leading)
                    }
                }
                .frame(width: size.width, height: size.height)
                .ehElevation(2)
                .rotation3DEffect(.degrees(angle), axis: (x: 0, y: 1, z: 0),
                                  anchor: .leading, perspective: 0.35)
                .position(x: rightX, y: size.height / 2)
            case .backward(let p):
                let angle = 180 * Double(1 - p)
                Group {
                    if abs(angle) > 90 {
                        leaf(index - 1, size: size, spine: .leading)
                            .rotation3DEffect(.degrees(180), axis: (x: 0, y: 1, z: 0))
                    } else {
                        leaf(index, size: size, spine: .trailing)
                    }
                }
                .frame(width: size.width, height: size.height)
                .ehElevation(2)
                .rotation3DEffect(.degrees(angle), axis: (x: 0, y: 1, z: 0),
                                  anchor: .trailing, perspective: 0.35)
                .position(x: leftX, y: size.height / 2)
            }
        }
        .frame(width: total.width, height: total.height)
    }

    /// Page numbers under each slot while nothing moves.
    private var beneathLeft: Int? {
        switch turn {
        case .idle, .forward: return index
        case .backward: return index - 2
        }
    }

    private var beneathRight: Int? {
        switch turn {
        case .idle: return index + 1 < pageCount ? index + 1 : nil
        case .forward: return index + 3 < pageCount ? index + 3 : nil
        case .backward: return index + 1 < pageCount ? index + 1 : nil
        }
    }

    /// A page, or blank paper past the end of an odd book. Inner corners tighten at the spine.
    @ViewBuilder
    private func leaf(_ page: Int?, size: CGSize, spine: HorizontalEdge) -> some View {
        let shape = UnevenRoundedRectangle(
            topLeadingRadius: spine == .leading ? 6 : 16, bottomLeadingRadius: spine == .leading ? 6 : 16,
            bottomTrailingRadius: spine == .trailing ? 6 : 16, topTrailingRadius: spine == .trailing ? 6 : 16
        )
        Group {
            if let page, page >= 0, page < pageCount {
                StaticPage(book: book, index: page, size: size, spineOnLeading: spine == .leading)
            } else {
                PaperBack(size: size)
            }
        }
        .frame(width: size.width, height: size.height)
        .clipShape(shape)
    }

    // MARK: - turning

    private func turnZone(width: CGFloat, action: @escaping () -> Void) -> some View {
        Color.clear
            .frame(width: width)
            .frame(maxHeight: .infinity)
            .contentShape(Rectangle())
            .onTapGesture(perform: action)
    }

    private func turn(forward: Bool) {
        guard turn == .idle else { return }
        if forward {
            guard canForward else { return }
            turn = .forward(0)
            animate(to: .forward(1)) { advance(by: 2) }
        } else {
            guard canBackward else { return }
            turn = .backward(1)
            animate(to: .backward(0)) { advance(by: -2) }
        }
    }

    private func turnGesture(pageWidth: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 6)
            .onChanged { value in
                let dx = value.translation.width
                let fraction = min(abs(dx) / max(pageWidth, 1), 1)
                // Dragging toward the spine from the right turns forward; from the left, back.
                if dx < 0 {
                    guard canForward else { return }
                    turn = .forward(fraction)
                } else {
                    guard canBackward else { return }
                    turn = .backward(1 - fraction)
                }
            }
            .onEnded { value in
                let dx = value.translation.width
                let fraction = min(abs(dx) / max(pageWidth, 1), 1)
                let velocity = abs(value.predictedEndTranslation.width - dx)
                // Commit on either a decent distance or a flick, so a quick page turn works.
                let commits = fraction > 0.3 || velocity > 120
                switch turn {
                case .forward where commits:
                    animate(to: .forward(1)) { advance(by: 2) }
                case .backward where commits:
                    animate(to: .backward(0)) { advance(by: -2) }
                case .forward, .backward:
                    // Rubber-band: an uncommitted turn falls back where it came from.
                    animate(to: dx < 0 ? .forward(0) : .backward(1)) { turn = .idle }
                case .idle:
                    break
                }
            }
    }

    private func animate(to target: Turn, then finish: @escaping () -> Void) {
        withAnimation(.easeOut(duration: 0.3)) { turn = target }
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(300))
            finish()
        }
    }

    private func advance(by delta: Int) {
        index = max(0, min(index + delta, max(pageCount - 1, 0)))
        turn = .idle
        speech.stop()
        replies.stop()
        // Cheapest delight in the app, and this audience is four.
        UIImpactFeedbackGenerator(style: .rigid).impactOccurred(intensity: 0.7)
    }

    // MARK: - bedtime + voice

    /// Read both pages aloud; when the spread carries a family voice, it follows (3b).
    private func readSpreadThenReply(then next: @escaping () -> Void = {}) {
        let text = spread.map { i in
            let page = book.page(index: Int32(i))
            return Speech.text(of: page, locale: book.contentLocale,
                               fallback: page.promptKey.map { Localized.s($0) })
        }
        .filter { !$0.isEmpty }
        .joined(separator: book.isJapanese ? "。" : ". ")
        let reply = spreadReply
        speech.speak(text: text, locale: book.contentLocale) {
            if let reply, replies.play(reply, onFinish: next) {
                show(Localized.s("read.replyPlaying", reply.from))
            } else {
                next()
            }
        }
    }

    private func toggleNight() {
        if night { endNight(); return }
        night = true
        readSpreadThenReply { scheduleNightTurn() }
    }

    /// Wait the interval, turn, read, and repeat until the last spread says おやすみなさい.
    private func scheduleNightTurn() {
        nightTask?.cancel()
        nightTask = Task { @MainActor in
            try? await Task.sleep(for: Self.nightInterval)
            guard !Task.isCancelled, night else { return }
            guard canForward else {
                endNight()
                show(Localized.s("read.goodnight"))
                return
            }
            turn = .forward(0)
            animate(to: .forward(1)) {
                advance(by: 2)
                readSpreadThenReply { scheduleNightTurn() }
            }
        }
    }

    private func endNight() {
        nightTask?.cancel()
        nightTask = nil
        night = false
        speech.stop()
        replies.stop()
    }

    private func show(_ text: String) {
        toast = text
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(1700))
            if toast == text { toast = nil }
        }
    }

    // MARK: - chrome

    private var topBar: some View {
        HStack(spacing: 10) {
            CircleIconButton(
                systemName: "arrow.left", diameter: 44,
                background: Color.ehSurface.opacity(0.14), foreground: .ehSurface
            ) {
                endNight()
                if let onBack {
                    onBack()
                } else if let editor = app.editor, editor.bookId == book.id {
                    app.screen = .editor(book.id)
                } else {
                    app.openShelf()
                }
            }
            VStack(alignment: .leading, spacing: 1) {
                Text(book.title)
                    .font(.ehUI(14.5))
                    .foregroundStyle(Color.ehSurface)
                    .lineLimit(1)
                Text("\(Localized.s("tablet.readSpread")) · \(index + 1) / \(pageCount)")
                    .font(.ehUI(11, .medium))
                    .foregroundStyle(Color.ehBg.opacity(0.6))
            }
            .layoutPriority(-1)
            Spacer(minLength: 4)
            Button {
                if speech.isSpeaking || replies.isPlaying {
                    speech.stop()
                    replies.stop()
                } else {
                    readSpreadThenReply()
                }
            } label: {
                Text(speech.isSpeaking ? Localized.s("read.stop") : Localized.s("read.aloud"))
                    .font(.ehUI(13.5))
                    .foregroundStyle(Color.ehSurface)
                    .padding(.horizontal, 16)
                    .frame(height: 44)
                    .background(Capsule().fill(speech.isSpeaking ? Color.ehAccent : Color.ehSurface.opacity(0.14)))
            }
            .buttonStyle(.plain)
            Button(action: toggleNight) {
                Text(Localized.s("read.night"))
                    .font(.ehUI(13.5))
                    .foregroundStyle(night ? Color.ehInk : Color.ehSurface)
                    .padding(.horizontal, 14)
                    .frame(height: 44)
                    .background(Capsule().fill(night ? Color.ehBg : Color.ehSurface.opacity(0.14)))
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
        .padding(.top, 6)
    }

    /// 「ばあば の こえ · 3.4びょう」 — tap to hear it on its own.
    private func replyChip(_ reply: PageReply) -> some View {
        Button {
            if replies.isPlaying { replies.stop() }
            else if !replies.play(reply) { show(Localized.s("read.cannotPlayVoice")) }
        } label: {
            HStack(spacing: 7) {
                Text(String(reply.from.prefix(1)))
                    .font(.ehUI(11))
                    .foregroundStyle(Color.ehSurface)
                    .frame(width: 24, height: 24)
                    .background(Circle().fill(replies.isPlaying ? Color.ehAccentDeep : Color.ehAccent))
                Text(Localized.replyChip(reply))
                    .font(.ehUI(12))
                    .foregroundStyle(Color.ehInk)
                    .lineLimit(1)
            }
            .padding(.leading, 6)
            .padding(.trailing, 12)
            .frame(height: 40)
            .background(Capsule().fill(Color.ehBg))
        }
        .buttonStyle(.plain)
    }

    private var dots: some View {
        HStack(spacing: 7) {
            ForEach(0..<pageCount, id: \.self) { page in
                let on = spread.contains(page)
                Circle()
                    .fill(on ? Color.ehBg : Color.ehBg.opacity(0.32))
                    .frame(width: on ? 9 : 6, height: on ? 9 : 6)
            }
        }
        .padding(.vertical, 10)
    }
}

/// A page with no interaction: the scene, plus the material half of decision #6.
private struct StaticPage: View {
    let book: Book
    let index: Int
    let size: CGSize
    let spineOnLeading: Bool

    private static let builder = SceneBuilder(measurer: UIKitTextMeasurer())
    private static let painter = ScenePainter()

    var body: some View {
        let target = RenderTarget.Companion.shared.screen(
            shape: book.shape,
            available: Size(w: Float(size.width), h: Float(size.height)),
            selectedItem: nil
        )
        let scene = Self.builder.build(
            page: book.page(index: Int32(index)), target: target, promptText: nil
        )
        Canvas { ctx, _ in
            ctx.withCGContext { Self.painter.draw(scene, into: $0) }
        }
        .frame(width: size.width, height: size.height)
        .background(Color(book.page(index: Int32(index)).background.uiColor))
        .paperGrain()
        .spineGutter(on: spineOnLeading ? .leading : .trailing)
    }
}

/// The reverse of a leaf mid-turn, and the blank facing page of an odd book: paper.
private struct PaperBack: View {
    let size: CGSize

    var body: some View {
        Color.ehBg
            .frame(width: size.width, height: size.height)
            .paperGrain(opacity: 0.8)
            .overlay(
                LinearGradient(
                    colors: [Color.black.opacity(0.12), Color.black.opacity(0.02)],
                    startPoint: .trailing, endPoint: .leading
                )
            )
    }
}
