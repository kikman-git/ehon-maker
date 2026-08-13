package app.ehon.engine

import app.ehon.model.StrokePoint
import kotlin.math.abs
import kotlin.math.hypot

/**
 * Ramer–Douglas–Peucker simplification, run once when a stroke ends.
 *
 * The prototype appends every `pointermove` sample, so at 120Hz a slow deliberate line
 * becomes hundreds of points. Simplifying at commit cuts that 5–10x with no visible
 * change, which is the difference between an ~800KB and a ~150KB book — and matters
 * doubly now that pages are Firestore documents with a 1MiB hard ceiling.
 */
object StrokeSimplify {

    /** 0.5px at the 322px reference page, expressed in normalised units. */
    const val DEFAULT_EPSILON = 0.5f / 322f

    fun simplify(points: List<StrokePoint>, epsilon: Float = DEFAULT_EPSILON): List<StrokePoint> {
        if (points.size <= 2) return points
        val keep = BooleanArray(points.size)
        keep[0] = true
        keep[points.lastIndex] = true
        recurse(points, 0, points.lastIndex, epsilon, keep)
        return points.filterIndexed { i, _ -> keep[i] }
    }

    private fun recurse(
        pts: List<StrokePoint>,
        first: Int,
        last: Int,
        epsilon: Float,
        keep: BooleanArray,
    ) {
        if (last <= first + 1) return
        var maxDist = -1f
        var index = first
        for (i in first + 1 until last) {
            val d = perpendicularDistance(pts[i], pts[first], pts[last])
            if (d > maxDist) {
                maxDist = d
                index = i
            }
        }
        if (maxDist <= epsilon) return
        keep[index] = true
        recurse(pts, first, index, epsilon, keep)
        recurse(pts, index, last, epsilon, keep)
    }

    private fun perpendicularDistance(p: StrokePoint, a: StrokePoint, b: StrokePoint): Float {
        val dx = b.x - a.x
        val dy = b.y - a.y
        if (dx == 0f && dy == 0f) return hypot(p.x - a.x, p.y - a.y)
        return abs(dy * p.x - dx * p.y + dx * a.y - dy * a.x) / hypot(dx, dy)
    }
}
