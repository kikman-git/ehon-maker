package app.ehon.engine

import app.ehon.model.StrokePoint
import kotlin.math.PI
import kotlin.math.sin
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertSame
import kotlin.test.assertTrue

class StrokeSimplifyTest {

    @Test
    fun `a straight line collapses to its endpoints`() {
        val line = (0..200).map { StrokePoint(it / 200f, it / 200f) }
        assertEquals(2, StrokeSimplify.simplify(line).size)
    }

    @Test
    fun `endpoints always survive`() {
        val curve = curve(300)
        val simplified = StrokeSimplify.simplify(curve)
        assertEquals(curve.first(), simplified.first())
        assertEquals(curve.last(), simplified.last())
    }

    @Test
    fun `a dense curve is cut substantially without losing its shape`() {
        val curve = curve(400)
        val simplified = StrokeSimplify.simplify(curve)

        assertTrue(
            simplified.size < curve.size / 5,
            "expected a >5x reduction, got ${curve.size} to ${simplified.size}",
        )
        // Every dropped point must still lie within epsilon of the retained polyline,
        // which is the property that makes the reduction invisible.
        curve.forEach { p ->
            assertTrue(
                distanceToPolyline(p, simplified) <= StrokeSimplify.DEFAULT_EPSILON * 1.001f,
                "point $p drifted from the simplified path",
            )
        }
    }

    @Test
    fun `order is preserved`() {
        val simplified = StrokeSimplify.simplify(curve(200))
        val original = curve(200)
        val indices = simplified.map { original.indexOf(it) }
        assertEquals(indices.sorted(), indices)
    }

    @Test
    fun `degenerate strokes are returned untouched`() {
        val dot = listOf(StrokePoint(0.5f, 0.5f))
        assertSame(dot, StrokeSimplify.simplify(dot))
        assertTrue(StrokeSimplify.simplify(emptyList()).isEmpty())
    }

    @Test
    fun `a repeated point does not divide by zero`() {
        val stuck = List(50) { StrokePoint(0.4f, 0.4f) }
        assertEquals(2, StrokeSimplify.simplify(stuck).size)
    }

    private fun curve(n: Int) = (0..n).map {
        val t = it / n.toFloat()
        StrokePoint(t, 0.5f + 0.3f * sin(t * 2f * PI.toFloat()))
    }

    private fun distanceToPolyline(p: StrokePoint, path: List<StrokePoint>): Float =
        path.zipWithNext().minOf { (a, b) -> segmentDistance(p, a, b) }

    private fun segmentDistance(p: StrokePoint, a: StrokePoint, b: StrokePoint): Float {
        val dx = b.x - a.x
        val dy = b.y - a.y
        val lenSq = dx * dx + dy * dy
        if (lenSq == 0f) return kotlin.math.hypot(p.x - a.x, p.y - a.y)
        val t = (((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq).coerceIn(0f, 1f)
        return kotlin.math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
    }
}
