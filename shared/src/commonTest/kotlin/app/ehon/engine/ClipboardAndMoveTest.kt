package app.ehon.engine

import app.ehon.FakeMeasurer
import app.ehon.design.Argb
import app.ehon.geom.Size
import app.ehon.model.Artwork
import app.ehon.model.Book
import app.ehon.model.BookId
import app.ehon.model.FontFace
import app.ehon.model.Item
import app.ehon.model.ItemId
import app.ehon.model.Page
import app.ehon.model.PageShape
import app.ehon.model.PartId
import app.ehon.model.PartItem
import app.ehon.model.TextItem
import app.ehon.scene.RenderTarget
import app.ehon.scene.SceneBuilder
import app.ehon.scene.SceneNode
import app.ehon.store.BookCodec
import kotlinx.collections.immutable.persistentListOf
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ClipboardAndMoveTest {
    private val bear = Artwork("""<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="#a56f45"/></svg>""", "Bear")
    private val part = PartItem(ItemId("bear"), 30f, 40f, partId = PartId("art:bear"), sizePct = 40f, rotationDeg = 15f)
    private val words = TextItem(ItemId("words"), 50f, 80f, text = "もりへ", colorIndex = 2, sizePct = 8.5f, font = FontFace.fromId("maru"), bold = true)

    private fun book(id: String = "a", art: Map<String, Artwork> = mapOf("bear" to bear)) = Book(
        BookId(id), "Bear", PageShape.SQUARE, "ja-JP", updatedAtEpochMs = 0, art = art,
        pages = persistentListOf(
            Page(Argb.hex("ffffff"), id = "p1", items = persistentListOf(part, words)),
            Page(Argb.hex("ffffff"), id = "p2"),
        ),
    )

    @Test
    fun `a copied item pastes onto another page as a new item, nudged clear, in one undo step`() {
        val c = EditorController(book(), FakeMeasurer)
        c.selectItem(part.id)
        val clip = c.copySelected()!!
        assertTrue(c.paste(clip))
        val nudged = c.page.items.last() as PartItem
        assertNotEquals(part.id, nudged.id)
        assertEquals(part.x + 3f, nudged.x)
        assertEquals(part.copy(id = nudged.id, x = nudged.x, y = nudged.y), nudged)
        c.goToPage(1)
        assertTrue(c.paste(clip))
        val placed = c.page.items.single() as PartItem
        assertEquals(part.x to part.y, placed.x to placed.y)
        assertEquals(placed.id, c.selectedId)
        c.undo()
        assertTrue(c.book.pages[1].items.isEmpty())
        assertEquals(3, c.book.pages[0].items.size)
    }

    @Test
    fun `text keeps its words and style through a paste`() {
        val c = EditorController(book(), FakeMeasurer)
        c.selectItem(words.id)
        val clip = c.copySelected()!!
        c.goToPage(1)
        assertTrue(c.paste(clip))
        val pasted = c.page.items.single() as TextItem
        assertEquals(words.copy(id = pasted.id), pasted)
        assertTrue(c.textBold)
        assertEquals(8.5f, c.textSizePct)
    }

    @Test
    fun `a book picture travels with its clip and never overwrites a different picture of the same name`() {
        val source = EditorController(book(), FakeMeasurer)
        source.selectItem(part.id)
        val clip = source.copySelected()!!
        val other = Artwork("""<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" fill="#000"/></svg>""", "Ball")
        val target = EditorController(book("b", mapOf("bear" to other)), FakeMeasurer)
        target.goToPage(1)
        assertTrue(target.paste(clip))
        val pasted = target.page.items.single() as PartItem
        assertEquals(PartId("art:bear-2"), pasted.partId)
        assertEquals(bear, target.book.art["bear-2"])
        assertEquals(other, target.book.art["bear"])
        BookCodec.decode(BookCodec.encode(target.book))
        val empty = EditorController(book("c", emptyMap()), FakeMeasurer)
        assertTrue(empty.paste(clip))
        assertEquals(bear, empty.book.art["bear"])
    }

    @Test
    fun `garbage, plain text and gestures in progress do not paste an item`() {
        val c = EditorController(book(), FakeMeasurer)
        val before = c.book
        assertFalse(c.paste("hello"))
        assertFalse(c.paste("""{"ehonClip":99,"item":{"type":"text","id":{"value":"x"},"x":1,"y":1,"text":"a"}}"""))
        c.selectItem(part.id)
        val clip = c.copySelected()!!
        c.beginDrag()
        assertFalse(c.paste(clip))
        c.cancelDrag()
        assertEquals(before, c.book)
        c.clearSelection()
        assertNull(c.copySelected())
    }

    @Test
    fun `pasted plain text becomes one line in the current style`() {
        val c = EditorController(book(), FakeMeasurer)
        c.setBold(true)
        c.setTextSizePct(12f)
        assertTrue(c.pasteText("  いち\nに\tさん  "))
        val pasted = c.page.items.last() as TextItem
        assertEquals("いち に さん", pasted.text)
        assertTrue(pasted.bold)
        assertEquals(12f, pasted.sizePct)
        assertFalse(c.pasteText(" \n "))
    }

    @Test
    fun `moving to another page keeps the item and its place, follows it there and undoes in one step`() {
        val c = EditorController(book(), FakeMeasurer)
        val before = c.book
        c.selectItem(part.id)
        c.moveSelectedToPage(1)
        assertEquals(1, c.pageIndex)
        assertEquals(part.id, c.selectedId)
        assertEquals(listOf<Item>(part), c.page.items.toList())
        assertEquals(listOf<Item>(words), c.book.pages[0].items.toList())
        c.moveSelectedToPage(0, 10f, 90f)
        assertEquals(10f to 90f, c.selected!!.x to c.selected!!.y)
        c.undo()
        c.undo()
        assertEquals(before.pages, c.book.pages)
    }

    @Test
    fun `any text colour wins over the preset, keeps the nearest preset for older readers and a preset clears it`() {
        val c = EditorController(book(), FakeMeasurer)
        c.selectItem(words.id)
        c.setCustomTextColour(Argb.hex("1f6fd1"))
        val tinted = c.selected as TextItem
        assertEquals(Argb.hex("1f6fd1"), tinted.color)
        val fill = SceneBuilder(FakeMeasurer).build(c.page, RenderTarget(Size(400f, 400f), RenderTarget.Kind.SHARE))
            .nodes.filterIsInstance<SceneNode.Text>().single().fill
        assertEquals(Argb.hex("1f6fd1"), fill)
        assertEquals(c.book, BookCodec.decode(BookCodec.encode(c.book)))
        c.clearSelection()
        assertTrue(c.pasteText("あお"))
        assertEquals(Argb.hex("1f6fd1"), (c.selected as TextItem).color)
        c.setTextColour(3)
        assertNull((c.selected as TextItem).color)
        assertEquals(3, (c.selected as TextItem).colorIndex)
    }

    @Test
    fun `twisting the handle sets an absolute angle and undoes as one step`() {
        val c = EditorController(book(), FakeMeasurer)
        c.selectItem(part.id)
        c.beginDrag()
        listOf(30f, 75f, -20f).forEach(c::rotateSelectedTo)
        c.endDrag()
        assertEquals(340f, c.selected!!.rotationDeg)
        c.undo()
        assertEquals(part.rotationDeg, c.selected!!.rotationDeg)
    }

    @Test
    fun `free sizes and bold apply to the selection, keep the phone's step nearest and render as outlined glyphs`() {
        val c = EditorController(book(), FakeMeasurer)
        c.selectItem(words.id)
        c.setTextSizePct(14f)
        c.setBold(false)
        assertEquals(14f, (c.selected as TextItem).sizePct)
        assertEquals(3, c.textSizeStep)
        c.setTextSizePct(500f)
        assertEquals(TextItem.MAX_SIZE_PCT, (c.selected as TextItem).sizePct)
        c.setBold(true)
        c.resizeSelected(bigger = false)
        assertEquals(TextItem.SIZES.last(), (c.selected as TextItem).sizePct)
        val text = SceneBuilder(FakeMeasurer).build(c.page, RenderTarget(Size(400f, 400f), RenderTarget.Kind.SHARE))
            .nodes.filterIsInstance<SceneNode.Text>().single()
        assertTrue(text.bold)
        assertEquals(c.book, BookCodec.decode(BookCodec.encode(c.book)))
    }
}
