package app.ehon.vector

import app.ehon.geom.Point
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.math.tan

/**
 * One step of an outline, always absolute. Painters map these one to one onto their native
 * path API; nothing else about vector art crosses the platform boundary.
 */
sealed interface PathCommand {
    data class MoveTo(val x: Float, val y: Float) : PathCommand
    data class LineTo(val x: Float, val y: Float) : PathCommand
    data class QuadTo(val x1: Float, val y1: Float, val x: Float, val y: Float) : PathCommand
    data class CubicTo(val x1: Float, val y1: Float, val x2: Float, val y2: Float, val x: Float, val y: Float) : PathCommand
    data object Close : PathCommand

    fun transformed(by: Affine): PathCommand = when (this) {
        is MoveTo -> by.apply(x, y).let { MoveTo(it.x, it.y) }
        is LineTo -> by.apply(x, y).let { LineTo(it.x, it.y) }
        is QuadTo -> {
            val c = by.apply(x1, y1)
            val p = by.apply(x, y)
            QuadTo(c.x, c.y, p.x, p.y)
        }
        is CubicTo -> {
            val c1 = by.apply(x1, y1)
            val c2 = by.apply(x2, y2)
            val p = by.apply(x, y)
            CubicTo(c1.x, c1.y, c2.x, c2.y, p.x, p.y)
        }
        Close -> Close
    }
}

enum class LineCap { BUTT, ROUND, SQUARE }

enum class LineJoin { MITER, ROUND, BEVEL }

/** SVG's `matrix(a b c d e f)`: x' = a·x + c·y + e, y' = b·x + d·y + f. */
data class Affine(val a: Float, val b: Float, val c: Float, val d: Float, val e: Float, val f: Float) {
    fun apply(x: Float, y: Float) = Point(a * x + c * y + e, b * x + d * y + f)

    /** `this ∘ other`: applies [other] first, as SVG composes a transform list left to right. */
    operator fun times(other: Affine) = Affine(
        a = a * other.a + c * other.b,
        b = b * other.a + d * other.b,
        c = a * other.c + c * other.d,
        d = b * other.c + d * other.d,
        e = a * other.e + c * other.f + e,
        f = b * other.e + d * other.f + f,
    )

    /** Mean scale factor, for stroke widths under a transform. */
    val scale: Float get() = sqrt(abs(a * d - b * c))

    companion object {
        val IDENTITY = Affine(1f, 0f, 0f, 1f, 0f, 0f)

        fun translate(tx: Float, ty: Float) = Affine(1f, 0f, 0f, 1f, tx, ty)

        fun scale(sx: Float, sy: Float) = Affine(sx, 0f, 0f, sy, 0f, 0f)

        fun rotate(deg: Float, cx: Float = 0f, cy: Float = 0f): Affine {
            val r = deg * PI.toFloat() / 180f
            val rotation = Affine(cos(r), sin(r), -sin(r), cos(r), 0f, 0f)
            return if (cx == 0f && cy == 0f) rotation else translate(cx, cy) * rotation * translate(-cx, -cy)
        }

        fun skewX(deg: Float) = Affine(1f, 0f, tan(deg * PI.toFloat() / 180f), 1f, 0f, 0f)

        fun skewY(deg: Float) = Affine(1f, tan(deg * PI.toFloat() / 180f), 0f, 1f, 0f, 0f)
    }
}
