import SwiftUI
import EhonCore

/// The page a child touches: renders the scene and turns gestures into editor intents.
///
/// Model 1a means this view's behaviour depends entirely on the current mode, and the mode
/// bar below is always visible — so "what does my finger do right now" is answerable by
/// looking at the screen. Tools never overlap the page, which is the property that keeps a
/// four-year-old from ruining a composition by accident.
struct EditorPage: View {
    @ObservedObject var model: EditorModel

    private static let builder = SceneBuilder(measurer: UIKitTextMeasurer())
    private static let painter = ScenePainter()

    /// Tracks whether the in-flight gesture is moving an item, drawing, or neither.
    @State private var activeGesture: ActiveGesture = .none

    private enum ActiveGesture { case none, dragging, drawing, missed }

    var body: some View {
        GeometryReader { geo in
            let available = Size(w: Float(max(geo.size.width, 1)), h: Float(max(geo.size.height, 1)))
            let target = RenderTarget.Companion.shared.screen(
                shape: model.book.shape,
                available: available,
                selectedItem: model.selectedId
            )
            let scene = Self.builder.build(
                page: model.page,
                target: target,
                promptText: model.page.promptKey.map { Localized.s($0) }
            )
            let pageSize = CGSize(width: CGFloat(scene.size.w), height: CGFloat(scene.size.h))
            let origin = CGPoint(
                x: (geo.size.width - pageSize.width) / 2,
                y: (geo.size.height - pageSize.height) / 2
            )

            ZStack(alignment: .topLeading) {
                Canvas { ctx, _ in
                    ctx.withCGContext { Self.painter.draw(scene, into: $0) }
                }
                .frame(width: pageSize.width, height: pageSize.height)
                .background(Color(model.page.background.uiColor))
                .clipShape(RoundedRectangle(cornerRadius: CGFloat(scene.cornerRadius)))
                .ehElevation(2)
                .offset(x: origin.x, y: origin.y)
                .gesture(gesture(pageSize: pageSize, origin: origin))

                selectionToolbar(pageSize: pageSize, origin: origin)
            }
        }
    }

    // MARK: - gestures

    private func gesture(pageSize: CGSize, origin: CGPoint) -> some Gesture {
        // minimumDistance 0 so a tap is a gesture too: selecting and drawing a dot both
        // need the very first touch.
        DragGesture(minimumDistance: 0)
            .onChanged { value in
                let unit = unitPoint(value.location, pageSize: pageSize, origin: origin)
                switch model.mode {
                case .draw:
                    if activeGesture == .none {
                        activeGesture = .drawing
                        model.apply { $0.beginStroke(x: unit.x, y: unit.y) }
                    } else if activeGesture == .drawing {
                        model.apply { $0.appendStroke(x: unit.x, y: unit.y) }
                    }
                default:
                    if activeGesture == .none {
                        let hit = model.controller.selectAt(
                            xPct: unit.x * 100, yPct: unit.y * 100,
                            pageSize: Size(w: Float(pageSize.width), h: Float(pageSize.height))
                        )
                        model.apply { _ in }
                        if hit != nil {
                            activeGesture = .dragging
                            model.controller.beginDrag()
                        } else {
                            activeGesture = .missed
                        }
                    } else if activeGesture == .dragging {
                        model.apply { $0.dragTo(xPct: unit.x * 100, yPct: unit.y * 100) }
                    }
                }
            }
            .onEnded { _ in
                switch activeGesture {
                case .drawing: model.apply { $0.endStroke() }
                case .dragging: model.apply { $0.endDrag() }
                case .missed, .none: break
                }
                activeGesture = .none
            }
    }

    /// Gesture location in 0..1 page space, clamped so a finger sliding off the edge still
    /// produces a usable value rather than a wild one.
    private func unitPoint(_ location: CGPoint, pageSize: CGSize, origin: CGPoint) -> (x: Float, y: Float) {
        let x = (location.x - origin.x) / max(pageSize.width, 1)
        let y = (location.y - origin.y) / max(pageSize.height, 1)
        return (Float(min(max(x, 0), 1)), Float(min(max(y, 0), 1)))
    }

    // MARK: - selection toolbar

    /// ちいさく / おおきく / rotate / けす, floating just above the selected item.
    @ViewBuilder
    private func selectionToolbar(pageSize: CGSize, origin: CGPoint) -> some View {
        if let item = model.controller.selected, model.mode != .draw {
            let centreX = origin.x + CGFloat(item.x) / 100 * pageSize.width
            let itemHalfHeight: CGFloat = {
                if let part = item as? PartItem {
                    return CGFloat(part.sizePct) / 100 * pageSize.width / 2
                }
                return 18
            }()
            let y = max(origin.y + 4,
                        origin.y + CGFloat(item.y) / 100 * pageSize.height - itemHalfHeight - 26)
            // Six buttons in おとな is ~340pt wide; keep it on the page for edge items.
            let halfWidth: CGFloat = model.controller.canReorder ? 172 : 104
            let x = min(max(centreX, origin.x + halfWidth), origin.x + pageSize.width - halfWidth)

            HStack(spacing: 5) {
                toolbarButton(Localized.s("sel.smaller")) { model.apply { $0.resizeSelected(bigger: false) } }
                toolbarButton(Localized.s("sel.bigger")) { model.apply { $0.resizeSelected(bigger: true) } }
                Button {
                    model.apply { $0.rotateSelected() }
                } label: {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(Color.ehSurface)
                        .padding(.horizontal, 9)
                        .padding(.vertical, 6)
                }
                .buttonStyle(.plain)
                if model.controller.canReorder {
                    toolbarButton(Localized.s("sel.backward")) { model.apply { $0.sendBackward() } }
                        .disabled(!model.controller.canSendBackward)
                        .opacity(model.controller.canSendBackward ? 1 : 0.4)
                    toolbarButton(Localized.s("sel.forward")) { model.apply { $0.bringForward() } }
                        .disabled(!model.controller.canBringForward)
                        .opacity(model.controller.canBringForward ? 1 : 0.4)
                }
                Button {
                    model.apply { $0.deleteSelected() }
                } label: {
                    Text(Localized.s("sel.delete"))
                        .font(.ehUI(11.5))
                        .foregroundStyle(Color.ehSurface)
                        .padding(.horizontal, 11)
                        .padding(.vertical, 5)
                        .background(Capsule().fill(Color.ehAccent))
                }
                .buttonStyle(.plain)
            }
            .padding(5)
            .background(Capsule().fill(Color.ehInk))
            .ehElevation(1)
            .fixedSize()
            .position(x: x, y: y)
        }
    }

    private func toolbarButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.ehUI(11.5))
                .foregroundStyle(Color.ehSurface)
                .padding(.horizontal, 9)
                .padding(.vertical, 5)
        }
        .buttonStyle(.plain)
    }
}
