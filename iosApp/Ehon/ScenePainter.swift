import UIKit
import EhonCore

/// Walks a `Scene` onto a CoreGraphics context.
///
/// Deliberately the structural twin of `painter-compose/ScenePainter.kt`: no layout, no
/// measurement, no decisions — every coordinate was resolved by the shared `SceneBuilder`.
/// That is what makes the screen, the 2048px share image and the 300dpi PDF the same
/// picture, and what keeps this file and its Compose counterpart from being able to drift
/// on anything except rasterisation.
///
/// Assumes a y-down context with a top-left origin, which is what UIKit's renderers and
/// SwiftUI's `withCGContext` both provide.
struct ScenePainter {

    let imageProvider: (String) -> UIImage?

    init(imageProvider: @escaping (String) -> UIImage? = { _ in nil }) {
        self.imageProvider = imageProvider
    }

    func draw(_ scene: Scene, into ctx: CGContext) {
        let bounds = CGRect(x: 0, y: 0, width: CGFloat(scene.size.w), height: CGFloat(scene.size.h))

        ctx.saveGState()
        if scene.cornerRadius > 0 {
            let rounded = UIBezierPath(roundedRect: bounds, cornerRadius: CGFloat(scene.cornerRadius))
            ctx.addPath(rounded.cgPath)
            ctx.clip()
        }
        ctx.setFillColor(scene.background.cgColor)
        ctx.fill(bounds)

        for node in scene.nodes {
            draw(node, into: ctx, pageBounds: bounds)
        }
        ctx.restoreGState()
    }

    private func draw(_ node: any SceneNode, into ctx: CGContext, pageBounds: CGRect) {
        switch node {

        case let group as SceneNodeGroup:
            ctx.saveGState()
            ctx.translateBy(x: CGFloat(group.pivot.x), y: CGFloat(group.pivot.y))
            ctx.rotate(by: CGFloat(group.rotationDeg) * .pi / 180)
            ctx.translateBy(x: -CGFloat(group.pivot.x), y: -CGFloat(group.pivot.y))
            for child in group.children {
                draw(child, into: ctx, pageBounds: pageBounds)
            }
            ctx.restoreGState()

        case let ellipse as SceneNodeEllipse:
            ctx.setFillColor(ellipse.fill.cgColor)
            ctx.fillEllipse(in: ellipse.rect.cgRect)
            if ellipse.hasHairline {
                ctx.setStrokeColor(Self.hairlineColour)
                ctx.setLineWidth(Self.hairlineWidth)
                ctx.strokeEllipse(in: ellipse.rect.cgRect)
            }

        case let rounded as SceneNodeRoundRect:
            let path = Self.roundRectPath(rounded.rect.cgRect, radii: rounded.radii.map { CGFloat(truncating: $0) })
            ctx.setFillColor(rounded.fill.cgColor)
            ctx.addPath(path)
            ctx.fillPath()
            if rounded.hasHairline {
                ctx.setStrokeColor(Self.hairlineColour)
                ctx.setLineWidth(Self.hairlineWidth)
                ctx.addPath(path)
                ctx.strokePath()
            }

        case let polygon as SceneNodePolygon:
            guard let first = polygon.points.first else { break }
            let path = CGMutablePath()
            path.move(to: first.cgPoint)
            for point in polygon.points.dropFirst() { path.addLine(to: point.cgPoint) }
            path.closeSubpath()
            ctx.setFillColor(polygon.fill.cgColor)
            ctx.addPath(path)
            ctx.fillPath()
            if polygon.hasHairline {
                ctx.setStrokeColor(Self.hairlineColour)
                ctx.setLineWidth(Self.hairlineWidth)
                ctx.addPath(path)
                ctx.strokePath()
            }

        // The three shapes that were CSS radial-gradient masks in the prototype.
        // Even-odd fills instead: no mask layer, and crisp at 300dpi.
        case let ring as SceneNodeRing:
            ctx.setFillColor(ring.fill.cgColor)
            ctx.addPath(Self.ringPath(ring.rect.cgRect, innerRatio: CGFloat(ring.innerRatio)))
            ctx.fillPath(using: .evenOdd)

        case let arc as SceneNodeArc:
            let full = arc.rect.cgRect
            ctx.saveGState()
            ctx.clip(to: CGRect(x: full.minX, y: full.minY, width: full.width, height: full.height / 2))
            ctx.setFillColor(arc.fill.cgColor)
            ctx.addPath(Self.ringPath(full, innerRatio: CGFloat(arc.innerRatio)))
            ctx.fillPath(using: .evenOdd)
            ctx.restoreGState()

        case let crescent as SceneNodeCrescent:
            // CoreGraphics has no path subtraction, so clip to the body and then clip
            // away the cutting circle with an even-odd rect-minus-circle.
            let body = crescent.rect.cgRect
            let radius = CGFloat(crescent.cutRadius)
            let cut = CGRect(
                x: CGFloat(crescent.cutCentre.x) - radius,
                y: CGFloat(crescent.cutCentre.y) - radius,
                width: radius * 2,
                height: radius * 2
            )
            ctx.saveGState()
            ctx.addEllipse(in: body)
            ctx.clip()
            let outer = body.union(cut).insetBy(dx: -1, dy: -1)
            let mask = CGMutablePath()
            mask.addRect(outer)
            mask.addEllipse(in: cut)
            ctx.addPath(mask)
            ctx.clip(using: .evenOdd)
            ctx.setFillColor(crescent.fill.cgColor)
            ctx.fill(body)
            ctx.restoreGState()

        case let image as SceneNodeImage:
            guard let bitmap = imageProvider(image.assetName), let cgImage = bitmap.cgImage else { break }
            ctx.saveGState()
            // UIImage draws y-up in a CGContext, so flip within the destination rect.
            let rect = image.rect.cgRect
            ctx.translateBy(x: rect.minX, y: rect.minY + rect.height)
            ctx.scaleBy(x: 1, y: -1)
            ctx.draw(cgImage, in: CGRect(x: 0, y: 0, width: rect.width, height: rect.height))
            ctx.restoreGState()

        case let text as SceneNodeText:
            if let ruby = text.ruby, let origin = text.rubyOrigin {
                Self.drawString(ruby, at: origin.cgPoint, size: CGFloat(text.rubySizePx),
                                fill: text.fill, role: text.font)
            }
            Self.drawString(text.base, at: text.baseOrigin.cgPoint, size: CGFloat(text.baseSizePx),
                            fill: text.fill, role: text.font)

        case let stroke as SceneNodeStrokePath:
            guard let first = stroke.points.first else { break }
            let path = CGMutablePath()
            path.move(to: first.cgPoint)
            if stroke.points.count == 1 {
                // A tap is a dot; a hair of length makes the round cap render.
                path.addLine(to: CGPoint(x: first.cgPoint.x + 0.01, y: first.cgPoint.y))
            } else {
                for point in stroke.points.dropFirst() { path.addLine(to: point.cgPoint) }
            }
            ctx.saveGState()
            ctx.setLineCap(.round)
            ctx.setLineJoin(.round)
            ctx.setLineWidth(CGFloat(stroke.widthPx))
            // The eraser lifts pixels rather than painting over them, so erasing above a
            // part reveals the page instead of smearing the page colour on top.
            ctx.setBlendMode(stroke.erase ? .clear : .normal)
            ctx.setStrokeColor(stroke.fill.cgColor)
            ctx.addPath(path)
            ctx.strokePath()
            ctx.restoreGState()

        case let selection as SceneNodeSelectionRing:
            ctx.saveGState()
            ctx.setStrokeColor(selection.stroke.cgColor)
            ctx.setLineWidth(Self.selectionWidth)
            ctx.setLineDash(phase: 0, lengths: [4, 3])
            ctx.addPath(UIBezierPath(roundedRect: selection.rect.cgRect,
                                     cornerRadius: Self.selectionRadius).cgPath)
            ctx.strokePath()
            ctx.restoreGState()

        default:
            assertionFailure("unhandled SceneNode: \(type(of: node))")
        }
    }

    // MARK: - helpers

    private static func drawString(
        _ text: String, at origin: CGPoint, size: CGFloat, fill: Int32, role: FontRole
    ) {
        // NSString.draw(at:) takes a TOP-LEFT origin and honours the y-down context, which
        // is exactly the convention SceneBuilder emits. Same call the measurer uses.
        (text as NSString).draw(at: origin, withAttributes: [
            .font: EhonFonts.font(for: role, size: size),
            .foregroundColor: UIColor(cgColor: fill.cgColor),
        ])
    }

    private static func ringPath(_ rect: CGRect, innerRatio: CGFloat) -> CGPath {
        let path = CGMutablePath()
        path.addEllipse(in: rect)
        let inner = CGRect(
            x: rect.midX - rect.width * innerRatio / 2,
            y: rect.midY - rect.height * innerRatio / 2,
            width: rect.width * innerRatio,
            height: rect.height * innerRatio
        )
        path.addEllipse(in: inner)
        return path
    }

    private static func roundRectPath(_ rect: CGRect, radii: [CGFloat]) -> CGPath {
        let cap = min(rect.width, rect.height) / 2
        let r = radii.map { min($0, cap) }
        guard r.count == 4 else {
            return UIBezierPath(roundedRect: rect, cornerRadius: r.first ?? 0).cgPath
        }
        let path = CGMutablePath()
        // Clockwise from top-left, matching SceneBuilder's radii order.
        path.move(to: CGPoint(x: rect.minX + r[0], y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX - r[1], y: rect.minY))
        path.addArc(tangent1End: CGPoint(x: rect.maxX, y: rect.minY),
                    tangent2End: CGPoint(x: rect.maxX, y: rect.minY + r[1]), radius: r[1])
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - r[2]))
        path.addArc(tangent1End: CGPoint(x: rect.maxX, y: rect.maxY),
                    tangent2End: CGPoint(x: rect.maxX - r[2], y: rect.maxY), radius: r[2])
        path.addLine(to: CGPoint(x: rect.minX + r[3], y: rect.maxY))
        path.addArc(tangent1End: CGPoint(x: rect.minX, y: rect.maxY),
                    tangent2End: CGPoint(x: rect.minX, y: rect.maxY - r[3]), radius: r[3])
        path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + r[0]))
        path.addArc(tangent1End: CGPoint(x: rect.minX, y: rect.minY),
                    tangent2End: CGPoint(x: rect.minX + r[0], y: rect.minY), radius: r[0])
        path.closeSubpath()
        return path
    }

    /// A single design constant, so scene nodes carry only a flag.
    private static let hairlineColour: CGColor = Organic.shared.hairline.cgColor

    private static let hairlineWidth: CGFloat = 1
    private static let selectionRadius: CGFloat = 6
    private static let selectionWidth: CGFloat = 2
}

// MARK: - bridging

/// `Argb` is a Kotlin inline value class, so it crosses the Obj-C boundary as a packed
/// `Int32` rather than a type. That avoids boxing a colour per shape, at the cost of
/// needing this one conversion.
extension Int32 {
    var cgColor: CGColor {
        let packed = UInt32(bitPattern: self)
        return CGColor(
            srgbRed: CGFloat((packed >> 16) & 0xFF) / 255,
            green: CGFloat((packed >> 8) & 0xFF) / 255,
            blue: CGFloat(packed & 0xFF) / 255,
            alpha: CGFloat((packed >> 24) & 0xFF) / 255
        )
    }
}

extension EhonCore.Rect {
    var cgRect: CGRect {
        CGRect(x: CGFloat(x), y: CGFloat(y), width: CGFloat(w), height: CGFloat(h))
    }
}

extension EhonCore.Point {
    var cgPoint: CGPoint { CGPoint(x: CGFloat(x), y: CGFloat(y)) }
}
