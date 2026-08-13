package app.ehon.catalog

import app.ehon.geom.Point
import kotlin.math.sqrt

/**
 * The ten shape primitives every procedural part is built from.
 *
 * The prototype draws these in CSS. Three of them (`o`, `cr`, `ar`) are
 * `radial-gradient` masks over a circle, which do not port to CoreGraphics or
 * Skia — they become even-odd fills instead, which is both simpler and sharper.
 * The ratios below are derived from the CSS rather than eyeballed; see [MaskGeometry].
 */
enum class ShapeKind {
    /** `c` — border-radius 50%. */
    CIRCLE,

    /** `s` — border-radius 24%. */
    SQUIRCLE,

    /** `r` — border-radius 999px, i.e. fully rounded on the short axis. */
    PILL,

    /** `t` — polygon(50% 3%, 97% 97%, 3% 97%). */
    TRIANGLE,

    /** `d` — polygon(50% 0, 100% 50%, 50% 100%, 0 50%). */
    DIAMOND,

    /** `st` — ten-point star polygon. */
    STAR,

    /** `l` — border-radius 4% 76% 4% 76%. */
    LEAF,

    /** `o` — a concentric ring. Was a radial mask. */
    RING,

    /** `cr` — a crescent, cut by an offset circle. Was an offset radial mask. */
    CRESCENT,

    /** `ar` — the top half of a ring. Was a radial mask plus a clip-path. */
    ARC,
    ;

    val isEvenOdd get() = this == RING || this == CRESCENT || this == ARC
}

/**
 * Geometry recovered from the prototype's CSS masks.
 *
 * A `radial-gradient(circle, …)` with no explicit size defaults to `farthest-corner`,
 * so a stop percentage is a fraction of the distance from the gradient's centre to
 * the box's furthest corner — not of the box side. Getting that wrong makes every
 * ring visibly too thick, so the arithmetic is spelled out here.
 */
object MaskGeometry {
    /** Centre to farthest corner of a unit square, from its centre: √2 / 2. */
    private val CENTRE_TO_CORNER = sqrt(2f) / 2f

    /** `radial-gradient(circle, transparent 58%, #000 59%)` over a circle of r=0.5. */
    val RING_INNER_RATIO: Float = 0.58f * CENTRE_TO_CORNER / 0.5f

    /** `radial-gradient(circle, transparent 62%, #000 63%)` over a circle of r=0.5. */
    val ARC_INNER_RATIO: Float = 0.62f * CENTRE_TO_CORNER / 0.5f

    /** `radial-gradient(circle at 132% 50%, transparent 62%, …)`: the cutting circle's centre. */
    val CRESCENT_CUT_CENTRE = Point(1.32f, 0.5f)

    /** Cutting circle radius, as a fraction of the box side. */
    val CRESCENT_CUT_RADIUS: Float =
        0.62f * sqrt(CRESCENT_CUT_CENTRE.x * CRESCENT_CUT_CENTRE.x + 0.5f * 0.5f)

    const val SQUIRCLE_RADIUS_PCT = 0.24f

    /** Per-corner radii for `LEAF`, clockwise from top-left. */
    val LEAF_RADII_PCT = listOf(0.04f, 0.76f, 0.04f, 0.76f)

    val TRIANGLE: List<Point> =
        listOf(Point(0.50f, 0.03f), Point(0.97f, 0.97f), Point(0.03f, 0.97f))

    val DIAMOND: List<Point> =
        listOf(Point(0.5f, 0f), Point(1f, 0.5f), Point(0.5f, 1f), Point(0f, 0.5f))

    val STAR: List<Point> = listOf(
        Point(0.50f, 0.00f), Point(0.61f, 0.33f), Point(0.97f, 0.34f), Point(0.68f, 0.55f),
        Point(0.79f, 0.90f), Point(0.50f, 0.68f), Point(0.21f, 0.90f), Point(0.32f, 0.55f),
        Point(0.03f, 0.34f), Point(0.39f, 0.33f),
    )

    fun polygon(kind: ShapeKind): List<Point>? = when (kind) {
        ShapeKind.TRIANGLE -> TRIANGLE
        ShapeKind.DIAMOND -> DIAMOND
        ShapeKind.STAR -> STAR
        else -> null
    }
}

/**
 * One coloured shape inside a part. Coordinates are percent of the part's own box,
 * so a part is scale-free and its layers survive any page size or output DPI.
 */
data class Layer(
    val kind: ShapeKind,
    val x: Float,
    val y: Float,
    val w: Float,
    val h: Float,
    /** Index into [app.ehon.design.Organic.crayons]. Never a hex — see decision #3. */
    val colorIndex: Int,
    val rotationDeg: Float = 0f,
)

/**
 * How a part is drawn.
 *
 * v1 ships raster illustrations, but [Primitives] is kept permanently rather than
 * deleted: it is the development placeholder that lets the app build and its golden
 * tests run before any commissioned art exists, and it decouples the engineering
 * schedule from the illustrator's.
 */
sealed interface PartDef {
    data class Primitives(val layers: List<Layer>) : PartDef

    /** Commissioned raster art. 1024px masters, WebP with alpha, square box. */
    data class Raster(val assetName: String) : PartDef

    /** Reserved: build-time-converted vector art, should the catalog ever move to SVG. */
    data class Vector(val pathData: String) : PartDef
}

data class Part(
    val id: app.ehon.model.PartId,
    val nameKey: String,
    val category: String,
    val def: PartDef,
)
