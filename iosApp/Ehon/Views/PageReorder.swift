import SwiftUI
import EhonCore

/// ならびかえ for pages: long-press a thumbnail to lift it, drop it on another page's slot.
///
/// The system drag session gives the lift delay, the preview and the haptic for free, and
/// works identically on phone and iPad. Adult-only via `canReorderPages` — in こども a finger
/// resting on a thumbnail must not reshuffle the book.
struct PageReorderable: ViewModifier {
    @ObservedObject var model: EditorModel
    let index: Int
    var cornerRadius: CGFloat = 8

    @State private var targeted = false

    func body(content: Content) -> some View {
        if model.controller.canReorderPages {
            content
                .draggable("\(index)")
                .dropDestination(for: String.self) { items, _ in
                    guard let raw = items.first, let from = Int(raw), from != index else { return false }
                    model.apply { $0.movePage(from: Int32(from), to: Int32(index)) }
                    return true
                } isTargeted: { targeted = $0 }
                .overlay(
                    RoundedRectangle(cornerRadius: cornerRadius)
                        .strokeBorder(Color.ehAccent, lineWidth: targeted ? 3 : 0)
                        .padding(-4)
                )
                .scaleEffect(targeted ? 1.06 : 1)
                .animation(.easeOut(duration: 0.15), value: targeted)
        } else {
            content
        }
    }
}

extension View {
    func pageReorderable(model: EditorModel, index: Int, cornerRadius: CGFloat = 8) -> some View {
        modifier(PageReorderable(model: model, index: index, cornerRadius: cornerRadius))
    }
}
