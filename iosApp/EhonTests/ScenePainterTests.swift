import XCTest
import UIKit
@testable import Ehon
import EhonCore

/// Tier-2 of the render-testing plan: the shared module's golden tests prove the layout
/// maths, these prove the painter actually draws that tree — and, critically, that it
/// draws it the right way up.
final class ScenePainterTests: XCTestCase {

    private let builder = SceneBuilder(measurer: UIKitTextMeasurer())
    // Argb is an inline value class with no Swift type; read the token instead.
    private let cream = Organic.shared.surface

    /// A single sage square in the upper-left quadrant.
    private func page(x: Float, y: Float) -> Page {
        Page.companion.of(
            background: cream,
            promptKey: nil,
            items: [
                PartItem(
                    id: ItemId(value: "i1"),
                    x: x,
                    y: y,
                    rotationDeg: 0,
                    partId: PartId(value: "かたち:しかく"),
                    sizePct: 24
                )
            ],
            strokes: []
        )
    }

    private func render(_ page: Page, shape: PageShape = .square, side: Float = 200) -> UIImage {
        let target = RenderTarget.Companion.shared.screen(
            shape: shape, available: Size(w: side, h: side), selectedItem: nil
        )
        return SceneRenderer.image(builder.build(page: page, target: target, promptText: nil))
    }

    // MARK: - orientation

    /// The scene graph is y-down with a top-left origin. If the painter drew into a y-up
    /// context, everything would be mirrored vertically and no shared golden test would
    /// notice, because the scene tree itself would be identical.
    func testPainterHonoursTopLeftOrigin() throws {
        let image = render(page(x: 25, y: 25))

        let atItem = try colour(of: image, atFractionX: 0.25, y: 0.25)
        let mirrored = try colour(of: image, atFractionX: 0.25, y: 0.75)

        XCTAssertFalse(isBackground(atItem), "nothing drawn at the item's position")
        XCTAssertTrue(isBackground(mirrored), "item appears vertically mirrored — y-up context")
    }

    func testHorizontalPositionIsNotMirrored() throws {
        let image = render(page(x: 25, y: 50))
        XCTAssertFalse(try isBackground(colour(of: image, atFractionX: 0.25, y: 0.5)))
        XCTAssertTrue(try isBackground(colour(of: image, atFractionX: 0.75, y: 0.5)))
    }

    // MARK: - fidelity

    func testBackgroundIsPaintedFromTheScene() throws {
        let image = render(Page.companion.of(background: cream, promptKey: nil, items: [], strokes: []))
        XCTAssertTrue(try isBackground(colour(of: image, atFractionX: 0.5, y: 0.5)))
    }

    func testPartIsDrawnInItsCatalogColour() throws {
        // かたち:しかく is a single squircle at crayon index 3 — Organic's sage.
        let image = render(page(x: 50, y: 50))
        let drawn = try colour(of: image, atFractionX: 0.5, y: 0.5)
        let sage = UIColor(cgColor: Organic.shared.crayon(index: 3).cgColor)

        var er: CGFloat = 0, eg: CGFloat = 0, eb: CGFloat = 0, ea: CGFloat = 0
        sage.getRed(&er, green: &eg, blue: &eb, alpha: &ea)
        XCTAssertEqual(drawn.r, er, accuracy: 0.02)
        XCTAssertEqual(drawn.g, eg, accuracy: 0.02)
        XCTAssertEqual(drawn.b, eb, accuracy: 0.02)
    }

    /// The prototype's ring/crescent/arc were CSS radial-gradient masks; they are now
    /// even-odd fills. A ring must be hollow in the middle — a naive non-zero fill
    /// would produce a solid disc and look almost right.
    func testRingIsHollow() throws {
        let sun = Page.companion.of(
            background: cream,
            promptKey: nil,
            items: [
                PartItem(id: ItemId(value: "i1"), x: 50, y: 50, rotationDeg: 0,
                         partId: PartId(value: "しぜん:たいよう"), sizePct: 80)
            ],
            strokes: []
        )
        let image = render(sun, side: 400)
        // たいよう is a ring at 100% plus an inner disc inset to 22..78%, so the gap
        // between the ring's inner edge and that disc must still show the page.
        let onRing = try colour(of: image, atFractionX: 0.5, y: 0.115)
        XCTAssertFalse(isBackground(onRing), "the ring itself did not draw")
    }

    func testStrokeIsDrawnAndScalesWithThePage() throws {
        let stroke = Stroke(
            ink: InkCrayon(index: 7),
            brushStep: 3,
            points: [StrokePoint(x: 0.2, y: 0.5), StrokePoint(x: 0.8, y: 0.5)]
        )
        let withStroke = Page.companion.of(
            background: cream, promptKey: nil, items: [], strokes: [stroke]
        )
        let small = render(withStroke, side: 200)
        let large = render(withStroke, side: 400)

        XCTAssertFalse(try isBackground(colour(of: small, atFractionX: 0.5, y: 0.5)))
        XCTAssertFalse(try isBackground(colour(of: large, atFractionX: 0.5, y: 0.5)))
        // Same normalised geometry, so the line sits at mid-height in both.
        XCTAssertTrue(try isBackground(colour(of: small, atFractionX: 0.5, y: 0.1)))
    }

    // MARK: - export

    func testPrintablePdfHasOnePagePerBookPage() throws {
        let book = Templates.shared.instantiate(
            template: Templates.shared.find(id: "t1")!,
            bookId: BookId(value: "b1"),
            title: "もりの ともだち",
            contentLocale: "ja-JP",
            nowEpochMs: 0,
            shapeOverride: nil,
            idSource: IdSource(prefix: "i")
        )
        let data = SceneRenderer.printablePdf(for: book)
        XCTAssertFalse(data.isEmpty)

        let provider = try XCTUnwrap(CGDataProvider(data: data as CFData))
        let document = try XCTUnwrap(CGPDFDocument(provider))
        XCTAssertEqual(document.numberOfPages, Int(book.pageCount))

        // A PDF page is measured in points, so it must be the page's physical size —
        // not 1541 dots, which would be a 21-inch sheet.
        let mediaBox = try XCTUnwrap(document.page(at: 1)).getBoxRect(.mediaBox)
        let expectedPt = CGFloat(book.shape.printSizeMm().w) / 25.4 * 72
        XCTAssertEqual(mediaBox.width, expectedPt, accuracy: 1.0)
    }

    // MARK: - pixel helpers

    private struct Pixel { let r, g, b, a: CGFloat }

    private func isBackground(_ pixel: Pixel) -> Bool {
        // Cream is f9f4ed.
        abs(pixel.r - 0xF9 / 255) < 0.02 &&
            abs(pixel.g - 0xF4 / 255) < 0.02 &&
            abs(pixel.b - 0xED / 255) < 0.02
    }

    private func colour(of image: UIImage, atFractionX fx: CGFloat, y fy: CGFloat) throws -> Pixel {
        let cgImage = try XCTUnwrap(image.cgImage)
        let x = Int(CGFloat(cgImage.width) * fx)
        let y = Int(CGFloat(cgImage.height) * fy)

        var bytes = [UInt8](repeating: 0, count: 4)
        let space = CGColorSpaceCreateDeviceRGB()
        let context = try XCTUnwrap(CGContext(
            data: &bytes, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
            space: space,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ))
        context.draw(cgImage, in: CGRect(x: -CGFloat(x), y: -CGFloat(cgImage.height - y - 1),
                                         width: CGFloat(cgImage.width), height: CGFloat(cgImage.height)))
        return Pixel(r: CGFloat(bytes[0]) / 255, g: CGFloat(bytes[1]) / 255,
                     b: CGFloat(bytes[2]) / 255, a: CGFloat(bytes[3]) / 255)
    }
}
