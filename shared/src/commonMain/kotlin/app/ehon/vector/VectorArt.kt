package app.ehon.vector

import app.ehon.design.Argb
import app.ehon.geom.Rect

/**
 * One filled and/or stroked outline of a piece of art, in the art's own viewBox units.
 *
 * Colours are plain [Argb] rather than crayon indices: this is illustration written by a person
 * or a model, not a catalog part, and recolouring it is an edit to its SVG (decision #55).
 * Nullable colours would box across the Obj-C boundary, hence the flags.
 */
data class VectorLayer(
    val commands: List<PathCommand>,
    val fill: Argb,
    val hasFill: Boolean,
    val stroke: Argb,
    /** In viewBox units; zero means no stroke. */
    val strokeWidth: Float,
    val evenOdd: Boolean = false,
    val lineCap: LineCap = LineCap.BUTT,
    val lineJoin: LineJoin = LineJoin.MITER,
)

/** A parsed [app.ehon.model.Artwork]: flat layers plus the names of anything the parser skipped. */
data class VectorArt(
    val viewBox: Rect,
    val layers: List<VectorLayer>,
    val unsupported: List<String> = emptyList(),
) {
    val aspect: Float get() = viewBox.w / viewBox.h
}
