import XCTest
import UIKit
@testable import Ehon
import EhonCore

/// Renders one page per shipped template at its declared shape and attaches the result.
///
/// Not an assertion suite — it is the tier-2 baseline generator. Attachments appear in the
/// .xcresult bundle for the release-time human comparison against the Compose painter, and
/// copies land in `EHON_BASELINE_DIR` when that is set.
final class ShapeBaselineTests: XCTestCase {

    func testRenderEveryTemplateAtItsDeclaredShape() throws {
        let builder = SceneBuilder(measurer: UIKitTextMeasurer())

        for template in Templates.shared.all {
            let book = Templates.shared.instantiate(
                template: template,
                bookId: BookId(value: template.id),
                title: template.id,
                contentLocale: "ja-JP",
                nowEpochMs: 0,
                shapeOverride: nil,
                idSource: IdSource(prefix: "i")
            )
            let target = RenderTarget.Companion.shared.screen(
                shape: book.shape,
                available: Size(w: 640, h: 640),
                selectedItem: nil
            )
            let scene = builder.build(
                page: book.page(index: 0),
                target: target,
                promptText: "だれが でてくる？"
            )
            let image = SceneRenderer.image(scene)

            XCTAssertGreaterThan(image.size.width, 0)
            XCTAssertEqual(
                Float(image.size.width / image.size.height),
                book.shape.aspect,
                accuracy: 0.01,
                "\(template.id) rendered at the wrong aspect ratio"
            )

            let name = "\(template.id)-\(shapeName(book.shape))"
            let attachment = XCTAttachment(image: image)
            attachment.name = name
            attachment.lifetime = .keepAlways
            add(attachment)

            if let dir = ProcessInfo.processInfo.environment["EHON_BASELINE_DIR"],
               let png = image.pngData() {
                try? png.write(to: URL(fileURLWithPath: dir).appendingPathComponent("\(name).png"))
            }
        }
    }

    private func shapeName(_ shape: PageShape) -> String {
        switch shape {
        case .landscape: return "landscape"
        case .portrait: return "portrait"
        default: return "square"
        }
    }
}
