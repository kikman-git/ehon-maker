import SwiftUI
import EhonCore

/// よむ — read mode, with the drag-driven 3D fold from decision #6.
///
/// The leaf pivots about the spine and tracks the finger, interruptible, rubber-banding
/// back if the turn isn't committed. That ordering matters: finger-tracking is the single
/// biggest contributor to "feels like a book", well ahead of actual paper curl — which is
/// why there is no shader here and the same maths ports to Compose unchanged.
struct ReadView: View {
    @EnvironmentObject var app: AppModel
    @StateObject private var speech = Speech.shared

    let book: Book
    @State private var index: Int
    @State private var turn: Turn = .idle

    init(book: Book, startPage: Int) {
        self.book = book
        _index = State(initialValue: startPage)
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

    /// Left-bound books turn right-to-left; 右綴じ would mirror this.
    private var leadingEdgeIsSpine: Bool { book.binding == PageBinding.left }

    var body: some View {
        VStack(spacing: 0) {
            topBar
            GeometryReader { geo in
                let box = Size(w: Float(max(geo.size.width - 32, 1)),
                               h: Float(max(geo.size.height - 24, 1)))
                let pageSize = book.shape.fitInto(box: box)
                let size = CGSize(width: CGFloat(pageSize.w), height: CGFloat(pageSize.h))

                ZStack {
                    beneathLayer(size: size)
                    leafLayer(size: size)
                }
                .frame(width: geo.size.width, height: geo.size.height)
                .contentShape(Rectangle())
                .gesture(turnGesture(pageWidth: size.width))
            }
            dots
        }
        .background(Color.ehInk)
        .onDisappear { speech.stop() }
    }

    // MARK: - layers

    /// The page revealed under the turning leaf.
    @ViewBuilder
    private func beneathLayer(size: CGSize) -> some View {
        let revealed: Int = {
            switch turn {
            case .forward: return min(index + 1, Int(book.pageCount) - 1)
            case .backward: return index
            case .idle: return index
            }
        }()
        StaticPage(book: book, index: revealed, size: size, spineOnLeading: leadingEdgeIsSpine)
            // A shadow cast by the lifted leaf, deepest when it is directly overhead.
            .overlay(
                Color.black
                    .opacity(0.35 * Double(sin(turn.progress * .pi)))
                    .allowsHitTesting(false)
            )
            .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    /// The leaf being turned.
    @ViewBuilder
    private func leafLayer(size: CGSize) -> some View {
        let leafIndex: Int = {
            switch turn {
            case .forward, .idle: return index
            case .backward: return max(index - 1, 0)
            }
        }()
        // forward: 0 → −180.  backward: −180 → 0.
        let angle: Double = {
            switch turn {
            case .idle: return 0
            case .forward(let p): return -180 * Double(p)
            case .backward(let p): return -180 * Double(1 - p)
            }
        }()
        let showingBack = abs(angle) > 90

        Group {
            if showingBack {
                // Past 90° the leaf's reverse faces us. Counter-rotated so it isn't mirrored.
                PaperBack(size: size)
                    .rotation3DEffect(.degrees(180), axis: (x: 0, y: 1, z: 0))
            } else {
                StaticPage(book: book, index: leafIndex, size: size,
                           spineOnLeading: leadingEdgeIsSpine)
            }
        }
        .frame(width: size.width, height: size.height)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .ehElevation(2)
        .rotation3DEffect(
            .degrees(angle),
            axis: (x: 0, y: 1, z: 0),
            anchor: leadingEdgeIsSpine ? .leading : .trailing,
            perspective: 0.35
        )
        .opacity(turn == .idle ? 1 : 0.999) // keeps the layer composited during the turn
    }

    // MARK: - gesture

    private func turnGesture(pageWidth: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 6)
            .onChanged { value in
                let dx = value.translation.width
                let fraction = min(abs(dx) / max(pageWidth, 1), 1)
                // Dragging toward the spine turns forward; away from it turns back.
                let forward = leadingEdgeIsSpine ? dx < 0 : dx > 0
                if forward {
                    guard index < Int(book.pageCount) - 1 else { return }
                    turn = .forward(fraction)
                } else {
                    guard index > 0 else { return }
                    turn = .backward(1 - fraction)
                }
            }
            .onEnded { value in
                let dx = value.translation.width
                let fraction = min(abs(dx) / max(pageWidth, 1), 1)
                let velocity = abs(value.predictedEndTranslation.width - dx)
                // Commit on either a decent distance or a flick, so a quick page turn works.
                let commits = fraction > 0.3 || velocity > 120
                let forward = leadingEdgeIsSpine ? dx < 0 : dx > 0

                switch turn {
                case .forward where commits:
                    animate(to: .forward(1)) { advance(by: 1) }
                case .backward where commits:
                    animate(to: .backward(0)) { advance(by: -1) }
                case .forward, .backward:
                    // Rubber-band: an uncommitted turn falls back where it came from.
                    animate(to: forward ? .forward(0) : .backward(1)) { turn = .idle }
                case .idle:
                    break
                }
            }
    }

    private func animate(to target: Turn, then finish: @escaping () -> Void) {
        withAnimation(.easeOut(duration: 0.26)) { turn = target }
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(260))
            finish()
        }
    }

    private func advance(by delta: Int) {
        let next = (index + delta).clamped(to: 0...(Int(book.pageCount) - 1))
        index = next
        turn = .idle
        speech.stop()
        // Cheapest delight in the app, and this audience is four.
        UIImpactFeedbackGenerator(style: .rigid).impactOccurred(intensity: 0.7)
    }

    // MARK: - chrome

    private var topBar: some View {
        HStack(spacing: 10) {
            CircleIconButton(
                systemName: "arrow.left", diameter: 44,
                background: Color.ehSurface.opacity(0.14), foreground: .ehSurface
            ) {
                speech.stop()
                if let editor = app.editor, editor.bookId == book.id {
                    app.screen = .editor(book.id)
                } else {
                    app.openShelf()
                }
            }
            Text(book.title)
                .font(.ehUI(14.5))
                .foregroundStyle(Color.ehSurface)
                .lineLimit(1)
            Spacer(minLength: 4)
            Button {
                if speech.isSpeaking {
                    speech.stop()
                } else {
                    speech.speak(
                        page: book.page(index: Int32(index)),
                        locale: book.contentLocale,
                        fallback: book.page(index: Int32(index)).promptKey.map { Localized.s($0) }
                    )
                }
            } label: {
                Text(speech.isSpeaking ? Localized.s("read.stop") : Localized.s("read.aloud"))
                    .font(.ehUI(13.5))
                    .foregroundStyle(Color.ehSurface)
                    .padding(.horizontal, 16)
                    .frame(height: 44)
                    .background(
                        Capsule().fill(
                            speech.isSpeaking ? Color.ehAccent : Color.ehSurface.opacity(0.14)
                        )
                    )
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
        .padding(.top, 6)
    }

    private var dots: some View {
        HStack(spacing: 7) {
            ForEach(0..<Int(book.pageCount), id: \.self) { page in
                Circle()
                    .fill(page == index ? Color.ehBg : Color.ehBg.opacity(0.32))
                    .frame(width: page == index ? 9 : 6, height: page == index ? 9 : 6)
            }
        }
        .padding(.bottom, 20)
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

/// The reverse of a leaf mid-turn: paper, not content.
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

private extension Comparable {
    func clamped(to range: ClosedRange<Self>) -> Self {
        min(max(self, range.lowerBound), range.upperBound)
    }
}
