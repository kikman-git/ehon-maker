import SwiftUI
import EhonCore

/// Draws one page of a book, sized to the space it is given.
///
/// The page dimensions come from `RenderTarget.screen`, never from constants — that is
/// what keeps a tablet layout a layout pass rather than a rewrite.
struct PageCanvas: View {
    let book: Book
    let pageIndex: Int
    var selectedItem: ItemId? = nil
    var promptText: String? = nil

    private let builder = SceneBuilder(measurer: UIKitTextMeasurer())
    private let painter = ScenePainter()

    var body: some View {
        GeometryReader { geometry in
            let target = RenderTarget.Companion.shared.screen(
                shape: book.shape,
                available: Size(w: Float(geometry.size.width), h: Float(geometry.size.height)),
                selectedItem: selectedItem
            )
            let scene = builder.build(
                page: book.page(index: Int32(pageIndex)),
                target: target,
                promptText: promptText
            )
            let pageSize = CGSize(width: CGFloat(scene.size.w), height: CGFloat(scene.size.h))

            Canvas { context, _ in
                context.withCGContext { cgContext in
                    painter.draw(scene, into: cgContext)
                }
            }
            .frame(width: pageSize.width, height: pageSize.height)
            .shadow(color: .black.opacity(0.22), radius: 16, x: 0, y: 12)
            .frame(width: geometry.size.width, height: geometry.size.height)
        }
    }
}
