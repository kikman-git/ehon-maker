package app.ehon.engine

import app.ehon.FakeMeasurer
import app.ehon.design.Argb
import app.ehon.geom.Size
import app.ehon.model.Artwork
import app.ehon.model.Book
import app.ehon.model.BookId
import app.ehon.model.Ink
import app.ehon.model.ItemId
import app.ehon.model.Page
import app.ehon.model.PageShape
import app.ehon.model.PartId
import app.ehon.model.PartItem
import app.ehon.model.Stroke
import app.ehon.scene.RenderTarget
import app.ehon.scene.SceneBuilder
import app.ehon.scene.SceneNode
import app.ehon.store.BookCodec
import app.ehon.store.BookSyncCodec
import kotlinx.collections.immutable.persistentListOf
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class IllustrationEditingTest {
    private val part = PartItem(ItemId("bear"), 50f, 50f, partId = PartId("art:bear"), sizePct = 40f)
    private fun book(item: PartItem = part, shape: PageShape = PageShape.SQUARE) = Book(
        BookId("edits"), "Bear", shape, "en", updatedAtEpochMs = 0,
        art = mapOf("bear" to Artwork("""<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="#a56f45"/></svg>""", "Bear")),
        pages = persistentListOf(
            Page(Argb.hex("ffffff"), id = "p1", items = persistentListOf(item)),
            Page(Argb.hex("ffffff"), id = "p2", items = persistentListOf(item.copy(id = ItemId("other")))),
        ),
    )

    @Test
    fun `corrections affect one instance and each stroke is one undo step`() {
        val c = EditorController(book(), FakeMeasurer)
        val original = c.book
        c.selectItem(part.id)
        c.beginIllustrationEdit()
        c.toggleEraser()
        c.beginStroke(.5f, .5f)
        repeat(24) { c.appendStroke(.5f, .5f + it / 1000f) }
        c.endStroke()
        val erased = c.book
        assertEquals(Ink.Eraser, (c.selected as PartItem).drawing!!.strokes.single().ink)
        assertTrue(c.page.strokes.isEmpty())
        assertEquals(original.page(1), c.book.page(1))
        assertEquals(original.art, c.book.art)
        c.setBrushColor(Argb.hex("a56f45"))
        c.beginStroke(.52f, .5f)
        c.endStroke()
        assertEquals(Ink.Solid(Argb.hex("a56f45")), (c.selected as PartItem).drawing!!.strokes.last().ink)
        c.undo()
        assertEquals(erased, c.book)
        c.undo()
        assertEquals(original, c.book)
        assertFalse(c.canUndo)
        c.redo()
        assertEquals(erased, c.book)
        assertTrue(c.isEditingIllustration)
    }

    @Test
    fun `a cancelled correction restores artwork and preserves redo`() {
        val c = EditorController(book(), FakeMeasurer)
        c.selectItem(part.id)
        c.beginIllustrationEdit()
        c.beginStroke(.5f, .5f)
        c.endStroke()
        c.undo()
        val before = c.book
        c.beginStroke(.4f, .4f)
        c.appendStroke(.7f, .6f)
        c.cancelDrag()
        assertEquals(before, c.book)
        assertTrue(c.canRedo)
        assertFalse(c.isGestureActive)
    }

    @Test
    fun `rotated non-square illustrations retain local corrections through transforms and export`() {
        val c = EditorController(book(part.copy(rotationDeg = 90f, heightPct = 20f), PageShape.PORTRAIT), FakeMeasurer)
        c.selectItem(part.id)
        c.beginIllustrationEdit()
        c.setBrush(1)
        c.toggleEraser()
        c.beginStroke(.5666667f, .575f)
        c.endStroke()
        val mark = (c.selected as PartItem).drawing!!.strokes.single()
        assertEquals(.75f, mark.points.single().x, .0001f)
        assertEquals(.25f, mark.points.single().y, .0001f)
        assertEquals(Stroke.widthFraction(1) / .4f, mark.width, .0001f)
        c.endIllustrationEdit()
        c.beginDrag()
        c.dragTo(40f, 60f)
        c.endDrag()
        c.resizeSelected(true)
        c.rotateSelected()
        val moved = c.selected as PartItem
        assertEquals(mark, moved.drawing!!.strokes.single())
        val builder = SceneBuilder(FakeMeasurer)
        val scene = builder.build(c.page, RenderTarget(Size(600f, 800f), RenderTarget.Kind.SHARE), null, c.book.art)
        val group = scene.nodes.single() as SceneNode.Group
        assertTrue(group.isolated)
        assertEquals(105f, group.rotationDeg)
        assertEquals(240f, group.pivot.x, .001f)
        assertEquals(480f, group.pivot.y, .001f)
        val rendered = group.children.last() as SceneNode.StrokePath
        assertTrue(rendered.erase)
        assertEquals(600f * Stroke.widthFraction(1) * PartItem.STEP_UP, rendered.widthPx, .001f)
        assertEquals(240f + moved.sizePct / 100f * 600f * .25f, rendered.points.single().x, .001f)
        assertEquals(480f - moved.heightPct!! / 100f * 800f * .25f, rendered.points.single().y, .001f)
    }

    @Test
    fun `file and page sync preserve corrections and older documents open without them`() {
        val c = EditorController(book(), FakeMeasurer)
        c.selectItem(part.id)
        c.beginIllustrationEdit()
        c.setBrushColor(Argb.hex("a56f45"))
        // Extending a leg beyond the original box is supported.
        c.beginStroke(.5f, .65f)
        c.appendStroke(.5f, .8f)
        c.endStroke()
        assertTrue((c.selected as PartItem).drawing!!.strokes.single().points.last().y > 1f)
        val encoded = BookCodec.encode(c.book)
        assertTrue(encoded.startsWith("{\"version\":5,"))
        assertEquals(c.book, BookCodec.decode(encoded))
        assertEquals(c.book, BookSyncCodec.assembleOrNull(BookSyncCodec.metadata(c.book), c.book.pages.map(BookCodec::encodePage)))
        val v4 = BookCodec.encode(book()).replace("\"version\":5", "\"version\":4")
        assertNull((BookCodec.decode(v4).page(0).items.single() as PartItem).drawing)
    }

    @Test
    fun `ending editing and changing page route new marks to the page drawing`() {
        val c = EditorController(book(), FakeMeasurer)
        c.selectItem(part.id)
        c.beginIllustrationEdit()
        c.endIllustrationEdit()
        c.beginStroke(.5f, .5f)
        c.endStroke()
        assertEquals(1, c.page.strokes.size)
        assertNull((c.selected as PartItem).drawing)
        c.beginIllustrationEdit()
        c.goToPage(1)
        assertFalse(c.isEditingIllustration)
        c.beginStroke(.5f, .5f)
        c.endStroke()
        assertEquals(1, c.page.strokes.size)
        assertNull((c.page.items.single() as PartItem).drawing)
        c.selectItem(ItemId("other"))
        c.beginIllustrationEdit()
        c.deleteSelected()
        assertFalse(c.isEditingIllustration)
        c.undo()
        assertNotNull(c.page.items.single())
    }
}
