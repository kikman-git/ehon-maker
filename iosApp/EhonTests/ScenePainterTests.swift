import XCTest
import UIKit
@testable import Ehon
import EhonCore

final class ScenePainterTests: XCTestCase {

    func testBundledStorybookMaterialsHaveTransparentMasters() throws {
        let folder = try XCTUnwrap(Bundle.main.resourceURL?.appendingPathComponent("materials/a"))
        let refs = try FileManager.default.contentsOfDirectory(atPath: folder.path)
        XCTAssertFalse(refs.isEmpty)
        for hash in refs {
            let image = try XCTUnwrap(AssetLoader.shared.image("a/\(hash)", master: true), hash)
            XCTAssertEqual(image.size.width, 1536)
            XCTAssertEqual(image.size.height, 1536)
            let corner = try colour(of: image, atFractionX: 0, y: 0)
            XCTAssertEqual(corner.a, 0, accuracy: 0.01)
        }
    }

    private let builder = SceneBuilder(measurer: UIKitTextMeasurer(), resolver: PainterFixtureParts())
    // Argb is an inline value class with no Swift type; read the token instead.
    private let cream = Organic.shared.surface

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
                    partId: PartId(value: "fixture:square"),
                    sizePct: 24, heightPct: nil, drawing: nil
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

    func testVersionTwoBookStillOpensAndGetsStablePageIDs() throws {
        let legacy = #"{"version":2,"book":{"id":{"value":"legacy"},"title":"もり","shape":"LANDSCAPE","contentLocale":"ja-JP","updatedAtEpochMs":1700000000000,"pages":[{"background":-984607,"items":[{"type":"part","id":{"value":"i1"},"x":50,"y":50,"partId":{"value":"いきもの:ねこ"},"sizePct":26}]},{"background":-984607}]}}"#
        let book = try XCTUnwrap(BookCodec.shared.decodeOrNull(text: legacy))
        XCTAssertEqual(book.pages.map(\.id), ["p1", "p2"])
        XCTAssertNil((book.page(index: 0).items.first as? PartItem)?.heightPct)
        XCTAssertGreaterThan(render(book.page(index: 0), shape: .landscape).size.width, 0)
        let restored = try XCTUnwrap(BookCodec.shared.decodeOrNull(text: BookCodec.shared.encode(book: book)))
        XCTAssertEqual(restored.pages.map(\.id), ["p1", "p2"])
    }

    func testNonSquarePartUsesTheSceneHeight() throws {
        let wide = Page.companion.of(
            background: cream, promptKey: nil,
            items: [PartItem(id: ItemId(value: "wide"), x: 50, y: 50, rotationDeg: 0,
                             partId: PartId(value: "fixture:square"), sizePct: 80, heightPct: KotlinFloat(value: 10), drawing: nil)],
            strokes: []
        )
        let image = render(wide, shape: .landscape, side: 600)
        XCTAssertFalse(try isBackground(colour(of: image, atFractionX: 0.75, y: 0.5)))
        XCTAssertTrue(try isBackground(colour(of: image, atFractionX: 0.5, y: 0.7)))
    }

    func testBackgroundIsPaintedFromTheScene() throws {
        let image = render(Page.companion.of(background: cream, promptKey: nil, items: [], strokes: []))
        XCTAssertTrue(try isBackground(colour(of: image, atFractionX: 0.5, y: 0.5)))
    }

    func testPartIsDrawnInItsCatalogColour() throws {

        let image = render(page(x: 50, y: 50))
        let drawn = try colour(of: image, atFractionX: 0.5, y: 0.5)
        let sage = UIColor(cgColor: Organic.shared.crayon(index: 3).cgColor)

        var er: CGFloat = 0, eg: CGFloat = 0, eb: CGFloat = 0, ea: CGFloat = 0
        sage.getRed(&er, green: &eg, blue: &eb, alpha: &ea)
        XCTAssertEqual(drawn.r, er, accuracy: 0.02)
        XCTAssertEqual(drawn.g, eg, accuracy: 0.02)
        XCTAssertEqual(drawn.b, eb, accuracy: 0.02)
    }

    func testRingIsHollow() throws {
        let sun = Page.companion.of(
            background: cream,
            promptKey: nil,
            items: [
                PartItem(id: ItemId(value: "i1"), x: 50, y: 50, rotationDeg: 0,
                         partId: PartId(value: "fixture:ring"), sizePct: 80, heightPct: nil, drawing: nil)
            ],
            strokes: []
        )
        let image = render(sun, side: 400)
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
        XCTAssertTrue(try isBackground(colour(of: small, atFractionX: 0.5, y: 0.1)))
    }

    func testRotatedIllustrationCorrectionsRevealSceneryAndKeepMatchingInk() throws {
        let document = ##"{"version":5,"book":{"id":{"value":"repair"},"title":"repair","shape":"SQUARE","contentLocale":"en","updatedAtEpochMs":0,"art":{"bear":{"svg":"<svg viewBox=\"0 0 100 100\"><rect width=\"100\" height=\"100\" fill=\"#a56f45\"/></svg>"},"scenery":{"svg":"<svg viewBox=\"0 0 100 100\"><rect width=\"100\" height=\"100\" fill=\"#7a8a5e\"/></svg>"}},"pages":[{"id":"p1","background":"#ffffff","items":[{"type":"part","id":{"value":"background"},"x":50,"y":50,"partId":{"value":"art:scenery"},"sizePct":100},{"type":"part","id":{"value":"bear"},"x":50,"y":50,"partId":{"value":"art:bear"},"sizePct":40,"heightPct":20,"rotationDeg":90,"drawing":{"strokes":[{"ink":{"type":"eraser"},"width":0.1,"points":[{"x":0.25,"y":0.5},{"x":0.75,"y":0.5}]},{"ink":{"type":"solid","color":"#a56f45"},"width":0.05,"points":[{"x":0.5,"y":0.5},{"x":0.5,"y":0.5}]}]}}]}]}}"##
        let book = try XCTUnwrap(BookCodec.shared.decodeOrNull(text: document))
        for side: Float in [200, 600] {
            let target = RenderTarget.Companion.shared.screen(shape: .square, available: Size(w: side, h: side), selectedItem: nil)
            let scene = builder.build(page: book.page(index: 0), target: target, promptText: nil, art: book.art)
            let image = SceneRenderer.image(scene)
            let hole = try colour(of: image, atFractionX: 0.5, y: 0.55)
            XCTAssertEqual(hole.r, 122.0 / 255, accuracy: 0.02)
            XCTAssertEqual(hole.g, 138.0 / 255, accuracy: 0.02)
            XCTAssertEqual(hole.b, 94.0 / 255, accuracy: 0.02)
            let restored = try colour(of: image, atFractionX: 0.5, y: 0.5)
            XCTAssertEqual(restored.r, 165.0 / 255, accuracy: 0.02)
            XCTAssertEqual(restored.g, 111.0 / 255, accuracy: 0.02)
            XCTAssertEqual(restored.b, 69.0 / 255, accuracy: 0.02)
        }
    }

    func testPageEraserOnlyRemovesPageInk() throws {
        let document = ##"{"version":4,"book":{"id":{"value":"ink"},"title":"ink","shape":"SQUARE","contentLocale":"en","updatedAtEpochMs":0,"pages":[{"id":"p1","background":"#ffffff","items":[{"type":"part","id":{"value":"square"},"x":50,"y":50,"partId":{"value":"fixture:square"},"sizePct":60}],"strokes":[{"ink":{"type":"crayon","index":6},"brushStep":1,"points":[{"x":0.3,"y":0.5},{"x":0.7,"y":0.5}]},{"ink":{"type":"eraser"},"brushStep":3,"points":[{"x":0.5,"y":0.4},{"x":0.5,"y":0.6}]}]}]}}"##
        let book = try XCTUnwrap(BookCodec.shared.decodeOrNull(text: document))
        let center = try colour(of: render(book.page(index: 0)), atFractionX: 0.5, y: 0.5)
        let sage = UIColor(cgColor: Organic.shared.crayon(index: 3).cgColor)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        sage.getRed(&r, green: &g, blue: &b, alpha: &a)
        XCTAssertEqual(center.r, r, accuracy: 0.02)
        XCTAssertEqual(center.g, g, accuracy: 0.02)
        XCTAssertEqual(center.b, b, accuracy: 0.02)
    }

    func testTextDrawsIntoAContextUIKitDidNotMakeCurrent() throws {
        let words = Page.companion.of(
            background: cream, promptKey: nil,
            items: [TextItem(id: ItemId(value: "t1"), x: 50, y: 50, rotationDeg: 0, text: "あいうえお",
                             ruby: nil, colorIndex: 0, sizePct: 8.5, font: .handwriting, bold: false, color: nil, lineHeight: 1.5)],
            strokes: []
        )
        let side = 300
        let target = RenderTarget.Companion.shared.screen(
            shape: .square, available: Size(w: Float(side), h: Float(side)), selectedItem: nil
        )
        let scene = builder.build(page: words, target: target, promptText: nil)
        let context = try XCTUnwrap(CGContext(
            data: nil, width: side, height: side, bitsPerComponent: 8, bytesPerRow: 0,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ))
        // The y-down, top-left space Canvas provides.
        context.translateBy(x: 0, y: CGFloat(side))
        context.scaleBy(x: 1, y: -1)
        ScenePainter().draw(scene, into: context)

        let image = UIImage(cgImage: try XCTUnwrap(context.makeImage()))
        var inked = 0
        for fx in stride(from: 0.3, through: 0.7, by: 0.02) {
            for fy in stride(from: 0.44, through: 0.56, by: 0.02) {
                if !isBackground(try colour(of: image, atFractionX: fx, y: fy)) { inked += 1 }
            }
        }
        XCTAssertGreaterThan(inked, 0, "text drew nowhere: NSString.draw had no current UIKit context")
    }

    func testPrintablePdfHasOnePagePerBookPage() throws {
        let book = Templates.shared.instantiate(
            template: Templates.shared.blank,
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

        // PDF dimensions use points, not the exported bitmap's pixel dimensions.
        let mediaBox = try XCTUnwrap(document.page(at: 1)).getBoxRect(.mediaBox)
        let expectedPt = CGFloat(book.shape.printSizeMm().w) / 25.4 * 72
        XCTAssertEqual(mediaBox.width, expectedPt, accuracy: 1.0)
    }

    private struct Pixel { let r, g, b, a: CGFloat }

    private func isBackground(_ pixel: Pixel) -> Bool {
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

private final class PainterFixtureParts: PartResolver {
    func find(id: PartId) -> Part? {
        let layer: Layer
        switch id.value {
        case "fixture:square":
            layer = Layer(kind: .squircle, x: 12, y: 12, w: 76, h: 76, colorIndex: 3, rotationDeg: 0)
        case "fixture:ring":
            layer = Layer(kind: .ring, x: 0, y: 0, w: 100, h: 100, colorIndex: 2, rotationDeg: 0)
        default: return PartCatalog.shared.find(id: id)
        }
        return Part(id: id, nameKey: id.value, category: "fixture", def: PartDefPrimitives(layers: [layer]))
    }
}
