package app.ehon.engine

import app.ehon.FakeMeasurer
import app.ehon.design.Organic
import app.ehon.geom.Size
import app.ehon.model.BookId
import app.ehon.model.FontFace
import app.ehon.model.Ink
import app.ehon.model.PageReply
import app.ehon.model.PartId
import app.ehon.model.TextItem
import app.ehon.scene.RenderTarget
import app.ehon.scene.SceneBuilder
import app.ehon.scene.SceneNode
import app.ehon.store.BookCodec
import app.ehon.template.IdSource
import app.ehon.template.Templates
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Model 2a: two palettes, six faces, こども / おとな, z-order, family replies. */
class ModelTwoATest {

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

    private fun EditorController.addText(text: String): TextItem {
        setMode(EditorMode.TEXT)
        setDraftText(text)
        commitText()
        return page.items.filterIsInstance<TextItem>().last()
    }

    // ── palettes ─────────────────────────────────────────────────────────────

    @Test
    fun `drawing palette is 14 crayons in two rows of seven, parts keep their nine`() {
        assertEquals(14, Organic.drawingCrayons.size)
        assertEquals(2, Organic.drawingCrayons.size / Organic.DRAWING_CRAYON_COLUMNS)
        assertEquals(9, Organic.crayons.size, "the part-layer ramp must not change")
        // Bottom row is the pastel of the row above: same hue family, much lighter.
        repeat(Organic.DRAWING_CRAYON_COLUMNS - 1) { i ->
            val bold = Organic.drawingCrayons[i]
            val pastel = Organic.drawingCrayons[i + Organic.DRAWING_CRAYON_COLUMNS]
            assertTrue(luminance(pastel) > luminance(bold), "column $i is not lighter below")
        }
    }

    @Test
    fun `a stroke is painted from the drawing palette, a part from the part ramp`() {
        val c = controller()
        c.setMode(EditorMode.DRAW)
        c.setCrayon(10) // pastel green — does not exist in the nine-colour ramp
        c.beginStroke(0.2f, 0.2f); c.appendStroke(0.8f, 0.2f); c.endStroke()

        val scene = SceneBuilder(FakeMeasurer).build(c.page, RenderTarget.screen(c.book.shape, Size(322f, 322f)))
        val stroke = scene.nodes.filterIsInstance<SceneNode.StrokePath>().single()
        assertEquals(Organic.drawingCrayons[10], stroke.fill)
        // The seeded ねこ is still brown (part ramp 6), untouched by the palette split.
        val partFills = scene.nodes.filterIsInstance<SceneNode.Group>()
            .flatMap { it.children }.filterIsInstance<SceneNode.Ellipse>().map { it.fill }
        assertTrue(Organic.crayons[6] in partFills, "part colours must come from Organic.crayons")
    }

    @Test
    fun `crayon index is clamped to the drawing palette`() {
        val c = controller()
        c.setCrayon(99)
        assertEquals(13, c.crayonIndex)
    }

    @Test
    fun `eight page backgrounds, including the two new pastels`() {
        assertEquals(8, Organic.pageBackgrounds.size)
    }

    // ── legacy books ─────────────────────────────────────────────────────────

    @Test
    fun `a version-1 book's strokes are remapped onto the new palette`() {
        val c = controller()
        c.setMode(EditorMode.DRAW)
        c.setCrayon(7); c.beginStroke(0.1f, 0.1f); c.appendStroke(0.5f, 0.5f); c.endStroke() // was ink
        c.setCrayon(8); c.beginStroke(0.1f, 0.2f); c.appendStroke(0.5f, 0.6f); c.endStroke() // was cream
        c.setCrayon(6); c.beginStroke(0.1f, 0.3f); c.appendStroke(0.5f, 0.7f); c.endStroke() // was brown
        val v1 = BookCodec.encode(c.book).replace("\"version\":${BookCodec.FORMAT_VERSION}", "\"version\":1")

        val inks = BookCodec.decode(v1).page(0).strokes.map { (it.ink as Ink.Crayon).index }
        assertEquals(listOf(6, 13, 1), inks, "ink→ink, cream→cream, brown→terracotta")
        assertEquals(app.ehon.design.Argb.hex("2e2b25"), Organic.drawingCrayons[6])
        assertEquals(app.ehon.design.Argb.hex("f9f4ed"), Organic.drawingCrayons[13])
    }

    @Test
    fun `a current-format book is not remapped`() {
        val c = controller()
        c.setMode(EditorMode.DRAW)
        c.setCrayon(7); c.beginStroke(0.1f, 0.1f); c.appendStroke(0.5f, 0.5f); c.endStroke()
        assertEquals(c.book, BookCodec.decode(BookCodec.encode(c.book)))
    }

    // ── fonts ────────────────────────────────────────────────────────────────

    @Test
    fun `six selectable faces, UI excluded, handwriting the default and the only bundled one`() {
        assertEquals(6, FontFace.selectable.size)
        assertFalse(FontFace.UI in FontFace.selectable)
        assertEquals(FontFace.HANDWRITING, FontFace.default)
        assertEquals(listOf(FontFace.HANDWRITING), FontFace.selectable.filter { it.bundled })
        assertTrue(FontFace.selectable.all { it.nameKey.startsWith("font.") })
    }

    @Test
    fun `font applies to the selected text and is carried by new text`() {
        val c = controller()
        c.setUiLevel(UiLevel.ADULT)
        val first = c.addText("あ")
        assertEquals(FontFace.HANDWRITING, first.font)

        c.setFont(FontFace.POP) // first is still selected after commit
        assertEquals(FontFace.POP, c.page.items.filterIsInstance<TextItem>().last().font)

        c.clearSelection()
        val second = c.addText("い")
        assertEquals(FontFace.POP, second.font, "the picker choice sticks for the next item")
    }

    @Test
    fun `the UI face can never be chosen for body text`() {
        val c = controller()
        c.setFont(FontFace.UI)
        assertEquals(FontFace.default, c.fontFace)
    }

    @Test
    fun `text is measured and drawn with its own face`() {
        val c = controller()
        c.setFont(FontFace.MARKER)
        c.addText("こんにちは")
        val scene = SceneBuilder(FakeMeasurer).build(c.page, RenderTarget.screen(c.book.shape, Size(322f, 322f)))
        val text = scene.nodes.filterIsInstance<SceneNode.Text>().single { it.base == "こんにちは" }
        assertEquals(FontFace.MARKER, text.font)
    }

    @Test
    fun `selecting text recalls its face into the picker`() {
        val c = controller()
        c.setFont(FontFace.STORYBOOK)
        val t = c.addText("ねこ")
        c.clearSelection(); c.setMode(EditorMode.STICK); c.setFont(FontFace.HANDWRITING)
        c.selectAt(t.x, t.y, Size(322f, 322f))
        assertEquals(FontFace.STORYBOOK, c.fontFace)
    }

    @Test
    fun `text sizes follow the 2a prototype`() {
        assertEquals(listOf(5f, 6.5f, 8.5f), TextItem.SIZES)
    }

    // ── こども / おとな ──────────────────────────────────────────────────────────

    @Test
    fun `kid mode hides furigana even in a japanese book, adult shows it`() {
        val c = controller()
        assertEquals(UiLevel.KID, c.uiLevel)
        assertFalse(c.showFuriganaField)
        c.setUiLevel(UiLevel.ADULT)
        assertTrue(c.showFuriganaField)
        c.toggleFurigana()
        assertFalse(c.showFuriganaField)
    }

    @Test
    fun `ruby typed while the field is hidden is not committed`() {
        val c = controller()
        c.setMode(EditorMode.TEXT)
        c.setDraftText("漢字"); c.setDraftRuby("かんじ")
        c.commitText()
        assertNull(c.page.items.filterIsInstance<TextItem>().last().ruby)
    }

    @Test
    fun `reordering is adult-only and needs a selection and company`() {
        val c = controller()
        c.selectAt(50f, 68f, Size(322f, 322f)) // ねこ
        assertFalse(c.canReorder)
        c.setUiLevel(UiLevel.ADULT)
        assertTrue(c.canReorder)
        c.clearSelection()
        assertFalse(c.canReorder)
    }

    // ── z-order ──────────────────────────────────────────────────────────────

    @Test
    fun `bring forward and send backward move one step and are undoable`() {
        val c = controller()
        c.setUiLevel(UiLevel.ADULT)
        c.addPart(PartId("かたち:まる"))
        val id = c.selectedId!!
        val last = c.page.items.lastIndex
        assertEquals(last, c.page.indexOf(id))
        assertFalse(c.canBringForward)
        assertTrue(c.canSendBackward)

        c.sendBackward()
        assertEquals(last - 1, c.page.indexOf(id))
        c.sendBackward(); c.sendBackward(); c.sendBackward(); c.sendBackward()
        assertEquals(0, c.page.indexOf(id), "clamped at the back")
        assertFalse(c.canSendBackward)

        c.bringForward()
        assertEquals(1, c.page.indexOf(id))

        c.undo()
        assertEquals(0, c.page.indexOf(id))
        // Front-most wins the tap, so z-order is also hit-test order: (50,60) lies inside both
        // まる (y 39..65) and the seeded ねこ (y 55..81), and ねこ is now in front.
        val hit = c.selectAt(50f, 60f, Size(322f, 322f))
        assertNotEquals(id, hit?.id, "the sent-back item should no longer win the tap")
        assertEquals("いきもの:ねこ", (hit as app.ehon.model.PartItem).partId.value)
    }

    // ── page order ───────────────────────────────────────────────────────────

    @Test
    fun `moving a page shifts the others, follows the current page, and is undoable`() {
        val c = controller()
        c.setUiLevel(UiLevel.ADULT)
        assertTrue(c.canReorderPages)
        val original = c.book.pages.toList()
        c.goToPage(0)

        c.movePage(from = 0, to = 3)
        assertEquals(listOf(original[1], original[2], original[3], original[0]), c.book.pages.take(4))
        assertEquals(3, c.pageIndex, "the moved page stays current")
        assertEquals("toast.pageMoved", c.consumeToast())

        c.undo()
        assertEquals(original, c.book.pages.toList())
    }

    @Test
    fun `a page moved across the current page nudges the index without changing the page`() {
        val c = controller()
        c.setUiLevel(UiLevel.ADULT)
        c.goToPage(2)
        val current = c.page
        c.movePage(from = 5, to = 0)      // from behind → in front of the current page
        assertEquals(3, c.pageIndex)
        assertEquals(current, c.page)
        c.movePage(from = 0, to = 7)      // and back past it
        assertEquals(2, c.pageIndex)
        assertEquals(current, c.page)
    }

    @Test
    fun `page reordering is adult-only and a no-op onto itself or out of range`() {
        val c = controller()
        assertFalse(c.canReorderPages)
        val before = c.book
        c.movePage(from = 1, to = 1)
        c.movePage(from = 99, to = 7)     // clamps to 7 → 7: nothing to do
        assertEquals(before, c.book)
        assertFalse(c.canUndo)
    }

    // ── replies ──────────────────────────────────────────────────────────────

    @Test
    fun `a page reply round-trips and pages without one report none`() {
        val c = controller()
        val book = c.book.mapPage(1) { it.copy(reply = PageReply(from = "ばあば", seconds = 3.4f, audioRef = "r1")) }
        val restored = BookCodec.decode(BookCodec.encode(book))
        assertFalse(restored.page(0).hasReply)
        assertTrue(restored.page(1).hasReply)
        assertEquals("ばあば", restored.page(1).reply!!.from)
        assertEquals(3.4f, restored.page(1).reply!!.seconds)
    }

    private fun luminance(c: app.ehon.design.Argb): Float =
        (0.2126f * c.r + 0.7152f * c.g + 0.0722f * c.b) / 255f
}
