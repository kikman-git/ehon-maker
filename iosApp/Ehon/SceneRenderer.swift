import UIKit
import EhonCore

/// Rasterises and PDF-writes scenes through the one shared painter.
enum SceneRenderer {

    /// PDF pages are measured in *points* (72/inch), not dots.
    ///
    /// Building the scene at 72dpi means the page is its true physical size and every
    /// vector — shapes, crayon strokes, text — is resolution-independent in the output.
    /// Only raster parts have a fixed resolution, and a 1024px master inside a ~370pt box
    /// is roughly 700dpi, comfortably past what a home or konbini printer resolves.
    /// Rasterising at 300dpi instead would make the *strokes* worse, not better.
    static let pdfDpi: Int32 = 72

    /// 300dpi, for a raster export where a PDF isn't wanted.
    static let printDpi: Int32 = 300

    static func image(_ scene: Scene, scale: CGFloat = 1) -> UIImage {
        let size = CGSize(width: CGFloat(scene.size.w), height: CGFloat(scene.size.h))
        let format = UIGraphicsImageRendererFormat()
        format.scale = scale
        format.opaque = false
        return UIGraphicsImageRenderer(size: size, format: format).image { context in
            ScenePainter().draw(scene, into: context.cgContext)
        }
    }

    /// One PDF page per scene. All pages of a book share a size, but this does not assume it.
    static func pdf(_ scenes: [Scene]) -> Data {
        guard let first = scenes.first else { return Data() }
        let bounds = CGRect(x: 0, y: 0, width: CGFloat(first.size.w), height: CGFloat(first.size.h))
        let painter = ScenePainter()
        return UIGraphicsPDFRenderer(bounds: bounds).pdfData { context in
            for scene in scenes {
                context.beginPage(withBounds:
                    CGRect(x: 0, y: 0, width: CGFloat(scene.size.w), height: CGFloat(scene.size.h)),
                    pageInfo: [:])
                painter.draw(scene, into: context.cgContext)
            }
        }
    }

    /// A single 2048px image of page 1, for LINE / Instagram / Photos.
    ///
    /// `watermark` is wired but always false in v1 — the paywall is deferred (decision #11)
    /// and this is the seam it switches on.
    static func shareImage(for book: Book, page: Int = 0, watermark: Bool = false) -> Data? {
        let builder = SceneBuilder(measurer: UIKitTextMeasurer())
        let target = RenderTarget.Companion.shared.share(
            shape: book.shape, longestEdgePx: 2048, watermark: watermark
        )
        let scene = builder.build(page: book.page(index: Int32(page)), target: target, promptText: nil)
        return image(scene).pngData()
    }

    /// Builds every page of a book at print size and writes one PDF.
    static func printablePdf(for book: Book, watermark: Bool = false) -> Data {
        let builder = SceneBuilder(measurer: UIKitTextMeasurer())
        let target = RenderTarget.Companion.shared.print(
            shape: book.shape, dpi: pdfDpi, watermark: watermark
        )
        let scenes = (0..<book.pageCount).map { index in
            builder.build(page: book.page(index: Int32(index)), target: target, promptText: nil)
        }
        return pdf(scenes)
    }
}
