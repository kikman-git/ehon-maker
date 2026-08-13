package app.ehon.geom

import kotlin.math.max
import kotlin.math.min

data class Size(val w: Float, val h: Float) {
    init {
        require(w > 0f && h > 0f) { "size must be positive, got ${w}x$h" }
    }

    fun scaled(f: Float) = Size(w * f, h * f)
}

data class Point(val x: Float, val y: Float)

data class Rect(val x: Float, val y: Float, val w: Float, val h: Float) {
    val centerX get() = x + w / 2f
    val centerY get() = y + h / 2f
    val center get() = Point(centerX, centerY)

    /** Rect of size [size] centred on ([cx], [cy]). Items are stored centre-anchored. */
    companion object {
        fun centred(cx: Float, cy: Float, size: Size) =
            Rect(cx - size.w / 2f, cy - size.h / 2f, size.w, size.h)
    }
}

/**
 * Fits [aspect] (w/h) inside [box], centred, touching whichever edge binds first.
 * This is the whole of decision #5: page dimensions are derived, never constants,
 * which is what keeps the iPad layout a layout pass instead of a rewrite.
 */
fun fitAspect(aspect: Float, box: Size): Size {
    val byWidth = Size(box.w, box.w / aspect)
    return if (byWidth.h <= box.h) byWidth else Size(box.h * aspect, box.h)
}

internal fun Float.clampTo(lo: Float, hi: Float) = max(lo, min(hi, this))
