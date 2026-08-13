package app.ehon.engine

import app.ehon.FakeMeasurer
import app.ehon.design.Organic
import app.ehon.model.BookId
import app.ehon.model.TextItem
import app.ehon.template.IdSource
import app.ehon.template.Templates
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** Text a child adds must be legible on the page it lands on. */
class TextColourTest {

    private fun controller() = EditorController(
        Templates.instantiate(
            template = Templates.find("t1")!!,
            bookId = BookId("b1"),
            title = "t",
            contentLocale = "ja-JP",
            nowEpochMs = 0L,
            idSource = IdSource("seed"),
        ),
        FakeMeasurer,
        IdSource("new"),
    )

    private fun addText(c: EditorController): TextItem {
        c.setMode(EditorMode.TEXT)
        c.setDraftText("こんにちは")
        c.commitText()
        return c.page.items.filterIsInstance<TextItem>().last()
    }

    private fun luminance(argb: app.ehon.design.Argb): Float =
        (0.2126f * argb.r + 0.7152f * argb.g + 0.0722f * argb.b) / 255f

    @Test
    fun `text is opaque and dark by default, not the cream crayon`() {
        val colour = Organic.textColor(addText(controller()).colorIndex)
        assertEquals(255, colour.a, "text was translucent")
        assertTrue(luminance(colour) < 0.5f, "default text colour is too light: $colour")
    }

    @Test
    fun `picking a drawing crayon does not change the text colour`() {
        val c = controller()
        // The cream crayon is for drawing on dark pages; it must never become text colour.
        c.setCrayon(Organic.CREAM_CRAYON)
        val colour = Organic.textColor(addText(c).colorIndex)
        assertTrue(luminance(colour) < 0.5f, "a crayon choice leaked into text: $colour")
    }

    @Test
    fun `every offered text colour is legible on a light page`() {
        repeat(Organic.textColors.size) { index ->
            val colour = Organic.textColor(index)
            assertEquals(255, colour.a)
            assertTrue(luminance(colour) < 0.62f, "textColors[$index] is too light: $colour")
        }
    }

    @Test
    fun `text colour can be changed after the text exists`() {
        val c = controller()
        addText(c)
        // The item stays selected after commit, so a colour tap must reach it.
        c.setTextColour(2)
        assertEquals(2, c.page.items.filterIsInstance<TextItem>().last().colorIndex)
    }

    @Test
    fun `selecting existing text reopens the text tool so it can be edited`() {
        val c = controller()
        addText(c)
        c.clearSelection()
        c.setMode(EditorMode.STICK)
        val text = c.page.items.filterIsInstance<TextItem>().last()
        c.selectAt(text.x, text.y, app.ehon.geom.Size(322f, 322f))
        assertEquals(EditorMode.TEXT, c.mode, "tapping text should reopen \u3082\u3058")
    }
}
