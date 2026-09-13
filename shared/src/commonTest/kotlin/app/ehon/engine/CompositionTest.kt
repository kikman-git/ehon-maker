package app.ehon.engine

import app.ehon.FakeMeasurer
import app.ehon.model.PartId
import app.ehon.model.PartItem
import app.ehon.model.ItemId
import app.ehon.store.BookCodec
import app.ehon.store.CodecV3Test
import kotlin.test.*

class CompositionTest {
    private fun controller() = EditorController(BookCodec.decode(CodecV3Test.V2), FakeMeasurer)

    @Test
    fun `batch of placement movement and resize is one undo step`() {
        val c = controller()
        val before = c.book
        val revision = c.revision
        c.applyBatch(listOf(
            EditorIntent.AddPart("lib:forest", 50f, 50f, 80f, 30f),
            EditorIntent.MoveSelected(42f, 38f),
            EditorIntent.ResizeSelected(true),
        ))
        val result = c.book
        val part = c.selected as PartItem
        assertEquals(42f, part.x)
        assertEquals(38f, part.y)
        assertEquals(30f / 80f, part.heightPct!! / part.sizePct, 0.00001f)
        assertEquals(revision + 1, c.revision)
        c.undo()
        assertEquals(before, c.book)
        assertFalse(c.canUndo)
        c.redo()
        assertEquals(result, c.book)
    }

    @Test
    fun `invalid batch leaves document selection revision and redo unchanged`() {
        val c = controller()
        c.addPart(PartId("かたち:まる"))
        c.undo()
        c.selectItem(ItemId("i1"))
        val book = c.book
        val revision = c.revision
        assertFailsWith<IllegalArgumentException> {
            c.applyBatch(listOf(EditorIntent.AddPart("lib:forest", 50f, 50f), EditorIntent.SelectItem("missing")))
        }
        assertEquals(book, c.book)
        assertEquals(ItemId("i1"), c.selectedId)
        assertEquals(revision, c.revision)
        assertTrue(c.canRedo)
    }

    @Test
    fun `batch cannot interrupt a live drag`() {
        val c = controller()
        c.beginDrag()
        assertFailsWith<IllegalStateException> { c.applyBatch(listOf(EditorIntent.AddPage)) }
        c.cancelDrag()
        c.applyBatch(listOf(EditorIntent.AddPage))
        assertEquals(3, c.book.pageCount)
    }

    @Test
    fun `reopened documents never reuse an existing item id`() {
        val c = controller()
        c.addPart(PartId("かたち:まる"))
        assertNotEquals(ItemId("i1"), c.selectedId)
        assertEquals(2, c.page.items.map { it.id }.distinct().size)
    }

    @Test
    fun `a selection click without movement does not create an undo step`() {
        val c = EditorController(BookCodec.decode(CodecV3Test.V2), FakeMeasurer, clock = { 123L })
        val original = c.book
        c.selectItem(ItemId("i1"))
        c.beginDrag()
        c.endDrag()
        assertEquals(original, c.book)
        assertFalse(c.canUndo)
    }

    @Test
    fun `clamped resize preserves aspect and legacy square stays implicit`() {
        val part = PartItem(ItemId("new"), 50f, 50f, partId = PartId("lib:forest"), sizePct = 80f, heightPct = 30f)
        val larger = part.resizedBy(2f)
        assertEquals(PartItem.MAX, larger.sizePct)
        assertEquals(part.heightPct!! / part.sizePct, larger.heightPct!! / larger.sizePct, 0.00001f)
        val smaller = part.resizedBy(0.001f)
        assertEquals(PartItem.MIN, smaller.sizePct)
        assertEquals(part.heightPct / part.sizePct, smaller.heightPct!! / smaller.sizePct, 0.00001f)
        assertNull(part.copy(heightPct = null).resizedBy(2f).heightPct)
    }
}
