package app.ehon.model

import app.ehon.geom.Size
import app.ehon.scene.RenderTarget
import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class PageShapeTest {

    /** The phone's page box after header, thumbnail strip, mode bar and drawer. */
    private val phoneBox = Size(370f, 332f)

    @Test
    fun `every shape fits the phone page box without overflowing it`() {
        PageShape.entries.forEach { shape ->
            val fitted = shape.fitInto(phoneBox)
            assertTrue(fitted.w <= phoneBox.w + TOLERANCE, "${shape.name} is ${fitted.w} wide")
            assertTrue(fitted.h <= phoneBox.h + TOLERANCE, "${shape.name} is ${fitted.h} tall")
            assertClose(shape.aspect, fitted.w / fitted.h)
        }
    }

    @Test
    fun `portrait no longer overflows now that sizes are derived`() {
        // The prototype hardcoded 258x338, which was 6px taller than the space it had.
        val fitted = PageShape.PORTRAIT.fitInto(phoneBox)
        assertClose(332f, fitted.h)
        assertClose(249f, fitted.w)
    }

    @Test
    fun `all three shapes fold through the same A5 leaf`() {
        assertClose(130.5f, PageShape.SQUARE.printSizeMm().w)
        assertClose(130.5f, PageShape.LANDSCAPE.printSizeMm().w)
        assertClose(130.5f, PageShape.PORTRAIT.printSizeMm().w)

        assertClose(130.5f, PageShape.SQUARE.printSizeMm().h)
        assertClose(87f, PageShape.LANDSCAPE.printSizeMm().h)
        assertClose(174f, PageShape.PORTRAIT.printSizeMm().h)

        PageShape.entries.forEach { shape ->
            val mm = shape.printSizeMm()
            assertTrue(mm.h <= PageShape.PRINT_LEAF_MM.h + TOLERANCE, "${shape.name} overruns")
        }
    }

    @Test
    fun `a square page at 300dpi is 1541 dots`() {
        val target = RenderTarget.print(PageShape.SQUARE, dpi = 300)
        assertClose(1541.3f, target.page.w, tolerance = 1f)
        assertClose(1541.3f, target.page.h, tolerance = 1f)
    }

    @Test
    fun `dpi is a parameter, so doubling it doubles the page`() {
        val at300 = RenderTarget.print(PageShape.LANDSCAPE, dpi = 300)
        val at600 = RenderTarget.print(PageShape.LANDSCAPE, dpi = 600)
        assertClose(2f, at600.page.w / at300.page.w)
    }

    @Test
    fun `share targets cap the longest edge`() {
        PageShape.entries.forEach { shape ->
            val t = RenderTarget.share(shape, longestEdgePx = 2048f)
            assertTrue(maxOf(t.page.w, t.page.h) <= 2048f + TOLERANCE)
        }
    }

    @Test
    fun `screen and print agree on aspect ratio for every shape`() {
        PageShape.entries.forEach { shape ->
            val screen = RenderTarget.screen(shape, phoneBox).page
            val print = RenderTarget.print(shape).page
            assertClose(screen.w / screen.h, print.w / print.h)
        }
    }

    @Test
    fun `books are left-bound by default, matching horizontal-hiragana ehon`() {
        val book = app.ehon.template.Templates.instantiate(
            template = app.ehon.template.Templates.all.first(),
            bookId = BookId("b1"),
            title = "t",
            contentLocale = "ja-JP",
            now = kotlinx.datetime.Instant.fromEpochSeconds(0),
        )
        assertEquals(Binding.LEFT, book.binding)
    }

    private companion object {
        const val TOLERANCE = 0.5f
    }

    private fun assertClose(expected: Float, actual: Float, tolerance: Float = 0.5f) =
        assertTrue(abs(expected - actual) < tolerance, "expected ~$expected but was $actual")
}
