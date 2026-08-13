package app.ehon.scene

import app.ehon.design.Argb
import app.ehon.geom.Point
import app.ehon.geom.Rect
import app.ehon.geom.Size

/** Which bundled face a text node draws with. See decision #10 on fonts. */
enum class FontRole {
    /** Yomogi, shipped complete: arbitrary user-typed text. */
    BODY,

    /** Zen Maru Gothic, subset to shipped strings: chrome only. */
    UI,
}

/**
 * A fully resolved page, in absolute coordinates of [size]. Pure data: no platform
 * types, no drawing, no measurement left to do. Every consumer — the SwiftUI painter,
 * the Compose painter, the PDF writer, and the golden tests — reads this same tree,
 * which is what makes WYSIWYG structural rather than something to maintain.
 */
data class Scene(
    val size: Size,
    val background: Argb,
    val cornerRadius: Float,
    val nodes: List<SceneNode>,
)

sealed interface SceneNode {

    /** Rotation is expressed by nesting, so parts and their layers compose naturally. */
    data class Group(
        val children: List<SceneNode>,
        val rotationDeg: Float = 0f,
        val pivot: Point,
    ) : SceneNode

    data class Ellipse(
        val rect: Rect,
        val fill: Argb,
        val hasHairline: Boolean = false,
    ) : SceneNode

    /** [radii] is clockwise from top-left, in absolute units. */
    data class RoundRect(
        val rect: Rect,
        val radii: List<Float>,
        val fill: Argb,
        val hasHairline: Boolean = false,
    ) : SceneNode

    data class Polygon(
        val points: List<Point>,
        val fill: Argb,
        val hasHairline: Boolean = false,
    ) : SceneNode

    /**
     * Concentric ring, drawn as an even-odd fill of two ellipses. Replaces the
     * prototype's `radial-gradient` mask, which has no CoreGraphics or Skia analogue.
     */
    data class Ring(
        val rect: Rect,
        val innerRatio: Float,
        val fill: Argb,
    ) : SceneNode

    /** Ellipse minus an offset ellipse, even-odd. Replaces the offset radial mask. */
    data class Crescent(
        val rect: Rect,
        val cutCentre: Point,
        val cutRadius: Float,
        val fill: Argb,
    ) : SceneNode

    /** Upper half of a ring — the rainbow band. Even-odd, then clipped to the top. */
    data class Arc(
        val rect: Rect,
        val innerRatio: Float,
        val fill: Argb,
    ) : SceneNode

    /** Commissioned raster part. [assetName] resolves per platform. */
    data class Image(
        val assetName: String,
        val rect: Rect,
    ) : SceneNode

    /**
     * Group ruby: [base] with [ruby] centred above it at half size.
     *
     * Both origins are already resolved, because the builder is handed a
     * [TextMeasurer] — so ruby centring is arithmetic the golden tests can assert,
     * rather than something each painter reinvents and gets subtly differently.
     */
    data class Text(
        val base: String,
        val baseOrigin: Point,
        val baseSizePx: Float,
        val ruby: String? = null,
        val rubyOrigin: Point? = null,
        val rubySizePx: Float = 0f,
        val fill: Argb,
        val font: FontRole = FontRole.BODY,
    ) : SceneNode

    /** A finger stroke, already scaled into page units. */
    data class StrokePath(
        val points: List<Point>,
        val widthPx: Float,
        val fill: Argb,
        /**
         * When true the painter composites destination-out and [fill] is ignored.
         *
         * A boolean rather than a nullable [fill]: `Argb?` cannot erase to `int32_t`
         * across the Obj-C boundary (primitives are not nullable), so it would box to
         * `Any` and every Swift call site would need an unbox. The flag also says what
         * is actually meant.
         */
        val erase: Boolean = false,
    ) : SceneNode

    /** Dashed selection ring around the selected item. Screen only, never exported. */
    data class SelectionRing(
        val rect: Rect,
        val stroke: Argb,
    ) : SceneNode
}

/**
 * Platform text measurement. The only thing the shared layout cannot do itself.
 *
 * Correctness depends on both platforms measuring identically, which is exactly why
 * decision #10 bundles the same font files rather than using system faces.
 */
fun interface TextMeasurer {
    fun width(text: String, fontSizePx: Float, font: FontRole): Float
}
