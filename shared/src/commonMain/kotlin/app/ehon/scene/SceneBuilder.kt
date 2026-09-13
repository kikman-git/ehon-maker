package app.ehon.scene

import app.ehon.catalog.Layer
import app.ehon.catalog.MaskGeometry
import app.ehon.catalog.PartCatalog
import app.ehon.catalog.PartDef
import app.ehon.catalog.PartResolver
import app.ehon.catalog.ShapeKind
import app.ehon.design.Argb
import app.ehon.design.Organic
import app.ehon.geom.Point
import app.ehon.geom.Rect
import app.ehon.geom.Size
import app.ehon.model.Artwork
import app.ehon.model.FontFace
import app.ehon.model.Ink
import app.ehon.model.Page
import app.ehon.model.PartId
import app.ehon.model.PartItem
import app.ehon.model.Stroke
import app.ehon.model.TextItem
import app.ehon.vector.Affine
import app.ehon.vector.SvgParser
import app.ehon.vector.VectorArt
import kotlin.math.min
import kotlin.math.sqrt

/**
 * Turns a [Page] into a [Scene]. The one place page layout exists.
 *
 * Everything geometric lives here: item placement, part layer composition, ruby
 * centring, stroke scaling, watermark placement, print margins. Both painters are
 * thin walkers over the result, so a layout bug is a bug in one file and a golden
 * test failure rather than a discrepancy nobody notices until a page is printed.
 */
class SceneBuilder(private val measurer: TextMeasurer, private val resolver: PartResolver) {

    // Kotlin default arguments do not produce a one-argument Swift initializer.
    constructor(measurer: TextMeasurer) : this(measurer, PartCatalog)

    fun build(page: Page, target: RenderTarget, promptText: String? = null): Scene =
        build(page, target, promptText, emptyMap())

    /** [art] is the owning book's embedded pictures, which `art:` items resolve against. */
    fun build(page: Page, target: RenderTarget, promptText: String?, art: Map<String, Artwork>): Scene {
        val nodes = buildList {
            if (page.isUntouched && promptText != null && !target.isExport) {
                add(promptNode(promptText, target))
            }
            page.items.forEach {
                addAll(when (it) {
                    is PartItem -> partNodes(it, target, art)
                    is TextItem -> textNodes(it, target)
                })
            }
            page.strokes.forEach { add(strokeNode(it, target)) }
            if (!target.isExport) {
                target.selectedItem
                    ?.let { selected -> page.items.firstOrNull { it.id == selected } }
                    ?.let { add(selectionRing(it, target)) }
            }
            if (target.watermark && target.isExport) add(watermarkNode(page, target))
        }
        return Scene(
            size = target.page,
            background = page.background,
            cornerRadius = if (target.isExport) 0f else RenderTarget.SCREEN_CORNER_RADIUS,
            nodes = nodes,
        )
    }

    // ── items ────────────────────────────────────────────────────────────────

    private fun partNodes(item: PartItem, target: RenderTarget, art: Map<String, Artwork>): List<SceneNode> {
        val box = Rect.centred(
            cx = item.x / 100f * target.page.w,
            cy = item.y / 100f * target.page.h,
            size = item.dimensions(target.page),
        )
        val def = definition(item.partId, art) ?: return emptyList()
        val inner = when (def) {
            is PartDef.Primitives -> def.layers.map { layerNode(it, box) }
            is PartDef.Raster -> listOf(SceneNode.Image(def.assetRef, box))
            is PartDef.Vector -> vectorNodes(def.art, box)
        }
        return listOf(SceneNode.Group(inner, item.rotationDeg, box.center))
    }

    /** The book's own art first; library, pack and catalog parts through the resolver. */
    private fun definition(partId: PartId, art: Map<String, Artwork>): PartDef? =
        if (partId.category == Artwork.CATEGORY) art[partId.name]?.let { PartDef.Vector(SvgParser.cached(it.svg)) }
        else resolver.find(partId)?.def

    /** Maps the art's viewBox onto the part box; a non-square viewBox stretches unless heightPct matches. */
    private fun vectorNodes(art: VectorArt, box: Rect): List<SceneNode> {
        val sx = box.w / art.viewBox.w
        val sy = box.h / art.viewBox.h
        val place = Affine.translate(box.x, box.y) * Affine.scale(sx, sy) * Affine.translate(-art.viewBox.x, -art.viewBox.y)
        val strokeScale = sqrt(sx * sy)
        return art.layers.map { layer ->
            SceneNode.Path(
                commands = layer.commands.map { it.transformed(place) },
                fill = layer.fill,
                hasFill = layer.hasFill,
                stroke = layer.stroke,
                strokeWidthPx = layer.strokeWidth * strokeScale,
                evenOdd = layer.evenOdd,
                lineCap = layer.lineCap,
                lineJoin = layer.lineJoin,
            )
        }
    }

    /** One coloured shape inside a part. Layer coordinates are percent of the part box. */
    private fun layerNode(layer: Layer, partBox: Rect): SceneNode {
        val rect = Rect(
            x = partBox.x + layer.x / 100f * partBox.w,
            y = partBox.y + layer.y / 100f * partBox.h,
            w = layer.w / 100f * partBox.w,
            h = layer.h / 100f * partBox.h,
        )
        val fill = Organic.crayons[layer.colorIndex]
        // The cream crayon is the page ground colour, so it needs a hairline to read.
        val hairline = layer.colorIndex == Organic.CREAM_CRAYON

        val shape: SceneNode = when (layer.kind) {
            ShapeKind.CIRCLE -> SceneNode.Ellipse(rect, fill, hairline)

            ShapeKind.SQUIRCLE -> SceneNode.RoundRect(
                rect,
                List(4) { min(rect.w, rect.h) * MaskGeometry.SQUIRCLE_RADIUS_PCT },
                fill,
                hairline,
            )

            ShapeKind.PILL -> SceneNode.RoundRect(
                rect,
                List(4) { min(rect.w, rect.h) / 2f },
                fill,
                hairline,
            )

            ShapeKind.LEAF -> SceneNode.RoundRect(
                rect,
                MaskGeometry.LEAF_RADII_PCT.map { it * min(rect.w, rect.h) },
                fill,
                hairline,
            )

            ShapeKind.TRIANGLE, ShapeKind.DIAMOND, ShapeKind.STAR -> SceneNode.Polygon(
                MaskGeometry.polygon(layer.kind)!!.map {
                    Point(rect.x + it.x * rect.w, rect.y + it.y * rect.h)
                },
                fill,
                hairline,
            )

            ShapeKind.RING -> SceneNode.Ring(rect, MaskGeometry.RING_INNER_RATIO, fill)

            ShapeKind.ARC -> SceneNode.Arc(rect, MaskGeometry.ARC_INNER_RATIO, fill)

            ShapeKind.CRESCENT -> SceneNode.Crescent(
                rect = rect,
                cutCentre = Point(
                    rect.x + MaskGeometry.CRESCENT_CUT_CENTRE.x * rect.w,
                    rect.y + MaskGeometry.CRESCENT_CUT_CENTRE.y * rect.h,
                ),
                cutRadius = MaskGeometry.CRESCENT_CUT_RADIUS * min(rect.w, rect.h),
                fill = fill,
            )
        }

        return if (layer.rotationDeg == 0f) shape
        else SceneNode.Group(listOf(shape), layer.rotationDeg, rect.center)
    }

    /**
     * Group ruby, resolved to absolute origins.
     *
     * The block (ruby line above base line) is centred on the item's anchor, and the
     * ruby is centred horizontally on the base — `(baseW - rubyW) / 2`, which is the
     * whole of decision #9 and is asserted by the golden tests.
     */
    private fun textNodes(item: TextItem, target: RenderTarget): List<SceneNode> {
        val baseSize = item.sizePct / 100f * target.page.w * TextItem.OPTICAL_SCALE
        val rubySize = baseSize * TextItem.RUBY_SCALE
        val cx = item.x / 100f * target.page.w
        val cy = item.y / 100f * target.page.h

        val baseW = measurer.width(item.text, baseSize, item.font)
        val baseLineH = baseSize * BASE_LINE_HEIGHT
        val rubyLineH = if (item.hasRuby) rubySize * RUBY_LINE_HEIGHT else 0f
        val blockTop = cy - (baseLineH + rubyLineH) / 2f

        val rubyW = if (item.hasRuby) measurer.width(item.ruby!!, rubySize, item.font) else 0f

        val node = SceneNode.Text(
            base = item.text,
            baseOrigin = Point(cx - baseW / 2f, blockTop + rubyLineH),
            baseSizePx = baseSize,
            ruby = item.ruby?.takeIf { item.hasRuby },
            rubyOrigin = if (item.hasRuby) Point(cx - rubyW / 2f, blockTop) else null,
            rubySizePx = if (item.hasRuby) rubySize else 0f,
            fill = Organic.textColors[item.colorIndex.coerceIn(Organic.textColors.indices)],
            font = item.font,
        )
        return if (item.rotationDeg == 0f) listOf(node)
        else listOf(SceneNode.Group(listOf(node), item.rotationDeg, Point(cx, cy)))
    }

    private fun strokeNode(stroke: Stroke, target: RenderTarget) = SceneNode.StrokePath(
        points = stroke.points.map { Point(it.x * target.page.w, it.y * target.page.h) },
        widthPx = Stroke.widthFraction(stroke.brushStep) * target.page.w,
        fill = when (val ink = stroke.ink) {
            is Ink.Crayon -> Organic.drawingCrayons[ink.index.coerceIn(Organic.drawingCrayons.indices)]
            Ink.Eraser -> Organic.ink
        },
        erase = stroke.ink == Ink.Eraser,
    )

    // ── chrome ───────────────────────────────────────────────────────────────

    private fun promptNode(text: String, target: RenderTarget): SceneNode {
        val size = PROMPT_SIZE_PCT * target.page.w
        val w = measurer.width(text, size, FontFace.default)
        return SceneNode.Text(
            base = text,
            baseOrigin = Point((target.page.w - w) / 2f, PROMPT_TOP_PCT * target.page.h),
            baseSizePx = size,
            fill = Organic.text.withAlpha(0.28f),
            font = FontFace.default,
        )
    }

    private fun selectionRing(item: app.ehon.model.Item, target: RenderTarget): SceneNode {
        val box = when (item) {
            is PartItem -> item.dimensions(target.page)
            is TextItem -> {
                val fontPx = item.sizePct / 100f * target.page.w * TextItem.OPTICAL_SCALE
                Size(
                    measurer.width(item.text, fontPx, item.font),
                    fontPx * (BASE_LINE_HEIGHT + if (item.hasRuby) RUBY_LINE_HEIGHT * TextItem.RUBY_SCALE else 0f),
                )
            }
        }
        val ring = SceneNode.SelectionRing(
            Rect.centred(
                item.x / 100f * target.page.w,
                item.y / 100f * target.page.h,
                box,
            ),
            Organic.accent,
        )
        return if (item.rotationDeg == 0f) ring
        else SceneNode.Group(listOf(ring), item.rotationDeg, ring.rect.center)
    }

    /**
     * Deferred with the paywall (decision #11) but built now, because it has to be a
     * scene node rather than a bitmap composited over the finished image — that is what
     * makes it scale correctly at both 2048px and 300dpi with no second code path.
     */
    private fun watermarkNode(page: Page, target: RenderTarget): SceneNode {
        val size = WATERMARK_SIZE_PCT * target.page.w
        val w = measurer.width(WATERMARK_TEXT, size, FontFace.UI)
        val inset = WATERMARK_INSET_PCT * target.page.w
        val onDark = luminance(page.background) < 0.5f
        return SceneNode.Text(
            base = WATERMARK_TEXT,
            baseOrigin = Point(
                target.page.w - inset - w,
                target.page.h - inset - size * BASE_LINE_HEIGHT,
            ),
            baseSizePx = size,
            fill = (if (onDark) Organic.surface else Organic.text).withAlpha(0.42f),
            font = FontFace.UI,
        )
    }

    private fun luminance(c: Argb): Float =
        (0.2126f * c.r + 0.7152f * c.g + 0.0722f * c.b) / 255f

    private companion object {
        /** From the prototype's `line-height:1.5` on page text. */
        const val BASE_LINE_HEIGHT = 1.5f
        const val RUBY_LINE_HEIGHT = 1.2f

        /** Prompt: 13px at a 322px reference page, 14px from the top. */
        const val PROMPT_SIZE_PCT = 13f / 322f
        const val PROMPT_TOP_PCT = 14f / 322f

        const val WATERMARK_SIZE_PCT = 0.026f
        const val WATERMARK_INSET_PCT = 0.03f
        const val WATERMARK_TEXT = "ぺたぺた で つくったよ"
    }
}
