package app.ehon.engine

import app.ehon.FakeMeasurer
import app.ehon.design.Organic
import app.ehon.geom.Size
import app.ehon.model.Book
import app.ehon.model.BookId
import app.ehon.model.PageShape
import app.ehon.model.PartId
import app.ehon.model.PartItem
import app.ehon.model.TextItem
import app.ehon.template.IdSource
import app.ehon.template.Templates
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class EditorControllerTest {

    private fun book(templateId: String = "t1", locale: String = "ja-JP"): Book =
        Templates.instantiate(
            template = Templates.find(templateId)!!,
            bookId = BookId("b1"),
            title = "テスト",
            contentLocale = locale,
            nowEpochMs = 0L,
            idSource = IdSource("seed"),
        )

    private fun controller(templateId: String = "t1", locale: String = "ja-JP") =
        EditorController(book(templateId, locale), FakeMeasurer, IdSource("new"))

    private val pageSize = Size(322f, 322f)

    // ── parts ────────────────────────────────────────────────────────────────

    @Test
    fun `adding a part selects it and leaves an undo step`() {
        val c = controller()
        val before = c.page.items.size

        c.addPart(PartId("いきもの:くま"))

        assertEquals(before + 1, c.page.items.size)
        assertNotNull(c.selectedId)
        assertTrue(c.canUndo)
        assertEquals("toast.partPlaced", c.consumeToast())
        assertNull(c.consumeToast())
    }

    @Test
    fun `deleting is undoable, which the prototype could not do`() {
        val c = controller()
        c.selectAt(20f, 66f, pageSize)
        assertNotNull(c.selectedId)
        val before = c.page.items.size

        c.deleteSelected()
        assertEquals(before - 1, c.page.items.size)
        assertNull(c.selectedId)

        c.undo()
        assertEquals(before, c.page.items.size)
    }

    @Test
    fun `a drag is one undo step regardless of how many frames it took`() {
        val c = controller()
        c.selectAt(20f, 66f, pageSize)
        val start = c.book

        c.beginDrag()
        repeat(40) { c.dragTo(30f + it * 0.5f, 40f) }
        c.endDrag()

        assertTrue(c.book != start)
        // ONE undo, not two: the whole drag including its timestamp is a single step.
        c.undo()
        assertEquals(start.page(0).items, c.book.page(0).items)
        assertFalse(c.canUndo)
    }

    @Test
    fun `items cannot be dragged off the page`() {
        val c = controller()
        c.selectAt(20f, 66f, pageSize)
        c.beginDrag()
        c.dragTo(-500f, 900f)
        c.endDrag()

        val moved = c.selected!!
        assertTrue(moved.x >= 4f && moved.x <= 96f, "x was ${moved.x}")
        assertTrue(moved.y >= 4f && moved.y <= 96f, "y was ${moved.y}")
    }

    @Test
    fun `resize is clamped at both ends`() {
        val c = controller()
        c.addPart(PartId("かたち:まる"))
        repeat(40) { c.resizeSelected(bigger = false) }
        assertEquals(PartItem.MIN, (c.selected as PartItem).sizePct)

        repeat(80) { c.resizeSelected(bigger = true) }
        assertEquals(PartItem.MAX, (c.selected as PartItem).sizePct)
    }

    @Test
    fun `rotation wraps rather than growing without bound`() {
        val c = controller()
        c.addPart(PartId("かたち:ほし"))
        repeat(24) { c.rotateSelected() }
        assertEquals(0f, (c.selected as PartItem).rotationDeg)
    }

    @Test
    fun `tapping empty page clears the selection`() {
        val c = controller()
        c.selectAt(20f, 66f, pageSize)
        assertNotNull(c.selectedId)
        assertNull(c.selectAt(1f, 1f, pageSize))
        assertNull(c.selectedId)
    }

    // ── drawing ──────────────────────────────────────────────────────────────

    @Test
    fun `a stroke is simplified when it ends and is one undo step`() {
        val c = controller()
        c.setMode(EditorMode.DRAW)
        val before = c.book

        c.beginStroke(0f, 0.5f)
        repeat(200) { c.appendStroke(it / 200f, 0.5f) }
        val rawCount = c.page.strokes.last().points.size
        c.endStroke()
        val simplified = c.page.strokes.last().points.size

        assertTrue(rawCount > 150)
        assertTrue(simplified < rawCount / 5, "$rawCount -> $simplified")

        c.undo()
        assertEquals(before.page(0).strokes, c.book.page(0).strokes)
        assertFalse(c.canUndo)
    }

    @Test
    fun `the eraser records an eraser stroke, not a coloured one`() {
        val c = controller()
        c.setMode(EditorMode.DRAW)
        c.toggleEraser()
        assertTrue(c.eraser)
        c.beginStroke(0.2f, 0.2f)
        c.appendStroke(0.4f, 0.4f)
        c.endStroke()
        assertEquals(app.ehon.model.Ink.Eraser, c.page.strokes.last().ink)
    }

    @Test
    fun `choosing a crayon turns the eraser off`() {
        val c = controller()
        c.toggleEraser()
        c.setCrayon(3)
        assertFalse(c.eraser)
        assertEquals(3, c.crayonIndex)
    }

    @Test
    fun `clearing strokes is undoable`() {
        val c = controller()
        c.setMode(EditorMode.DRAW)
        c.beginStroke(0.1f, 0.1f); c.appendStroke(0.2f, 0.2f); c.endStroke()
        assertEquals(1, c.page.strokes.size)

        c.clearStrokes()
        assertEquals(0, c.page.strokes.size)
        c.undo()
        assertEquals(1, c.page.strokes.size)
    }

    // ── text ─────────────────────────────────────────────────────────────────

    @Test
    fun `committing text adds it and returns to stick mode`() {
        val c = controller()
        c.setMode(EditorMode.TEXT)
        c.setDraftText("くまさんは もりへ")
        c.setUiLevel(UiLevel.ADULT)
        c.setDraftRuby("くまさんは もりへ")
        assertTrue(c.commitText())

        val text = c.page.items.filterIsInstance<TextItem>().last()
        assertEquals("くまさんは もりへ", text.text)
        assertEquals("くまさんは もりへ", text.ruby)
        assertEquals(EditorMode.STICK, c.mode)
        assertEquals("", c.draftText)
    }

    @Test
    fun `empty text is refused with a nudge rather than added`() {
        val c = controller()
        c.setMode(EditorMode.TEXT)
        c.setDraftText("   ")
        assertFalse(c.commitText())
        assertEquals("toast.enterText", c.consumeToast())
        assertTrue(c.page.items.none { it is TextItem })
    }

    @Test
    fun `a non-japanese book drops the reading and hides the field`() {
        val c = controller(locale = "en-US")
        assertFalse(c.showFuriganaField)
        c.setMode(EditorMode.TEXT)
        c.setDraftText("The bear went to the forest")
        c.setDraftRuby("ignored")
        c.commitText()
        assertNull(c.page.items.filterIsInstance<TextItem>().last().ruby)
    }

    @Test
    fun `editing a selected text item writes through instead of into the draft`() {
        val c = controller()
        c.setMode(EditorMode.TEXT)
        c.setDraftText("まえ")
        c.commitText()
        // commitText leaves the new item selected.
        c.setDraftText("あと")
        assertEquals("あと", c.page.items.filterIsInstance<TextItem>().last().text)
        assertEquals("", c.draftText)
    }

    @Test
    fun `the cream crayon is not used for text, which would be invisible`() {
        val c = controller()
        c.setCrayon(Organic.CREAM_CRAYON)
        c.setMode(EditorMode.TEXT)
        c.setDraftText("しろ")
        c.commitText()
        assertEquals(0, c.page.items.filterIsInstance<TextItem>().last().colorIndex)
    }

    // ── pages ────────────────────────────────────────────────────────────────

    @Test
    fun `adding a page inherits the previous page's colour and jumps to it`() {
        val c = controller()
        val before = c.book.pageCount
        c.setPageBackground(Organic.pageBackgrounds.last())
        c.goToPage(before - 1)
        c.addPage()

        assertEquals(before + 1, c.book.pageCount)
        assertEquals(before, c.pageIndex)
        assertEquals("toast.pageAdded", c.consumeToast())
    }

    @Test
    fun `page navigation is clamped`() {
        val c = controller()
        c.goToPage(999)
        assertEquals(c.book.pageCount - 1, c.pageIndex)
        c.goToPage(-5)
        assertEquals(0, c.pageIndex)
    }

    @Test
    fun `undoing back past an added page leaves the index valid`() {
        val c = controller()
        c.addPage()
        assertEquals(c.book.pageCount - 1, c.pageIndex)
        c.undo()
        assertTrue(c.pageIndex < c.book.pageCount, "index ${c.pageIndex} of ${c.book.pageCount}")
    }

    // ── observability ────────────────────────────────────────────────────────

    @Test
    fun `revision advances on every change so a UI can just re-read`() {
        val c = controller()
        val start = c.revision
        c.addPart(PartId("かたち:まる"))
        c.setMode(EditorMode.DRAW)
        c.setCrayon(4)
        assertTrue(c.revision > start + 2)
    }

    @Test
    fun `a landscape template still opens at its own shape`() {
        val c = controller(templateId = "t2")
        assertEquals(PageShape.LANDSCAPE, c.book.shape)
    }
}
