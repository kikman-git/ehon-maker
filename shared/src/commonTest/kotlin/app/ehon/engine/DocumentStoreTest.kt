package app.ehon.engine

import app.ehon.model.Book
import app.ehon.model.BookId
import app.ehon.model.ItemId
import app.ehon.model.PartId
import app.ehon.model.PartItem
import app.ehon.template.Templates
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class DocumentStoreTest {

    private fun book(): Book = Templates.instantiate(
        template = Templates.find("t1")!!,
        bookId = BookId("b1"),
        title = "もりの ともだち",
        contentLocale = "ja-JP",
        nowEpochMs = 0L,
    )

    private fun Book.addPart(id: String) = mapPage(0) { page ->
        page.copy(
            items = page.items.add(
                PartItem(ItemId(id), 50f, 50f, partId = PartId("いきもの:くま")),
            ),
        )
    }

    private fun Book.removeFirstItem() = mapPage(0) { page ->
        page.copy(items = page.items.removeAt(0))
    }

    @Test
    fun `undo restores a deleted part, which the prototype could not do`() {
        val store = DocumentStore(book())
        val before = store.current.page(0).items.size
        assertTrue(before > 0)

        store.edit { it.removeFirstItem() }
        assertEquals(before - 1, store.current.page(0).items.size)

        assertTrue(store.undo())
        assertEquals(before, store.current.page(0).items.size)
    }

    @Test
    fun `undo covers placement, not only strokes`() {
        val store = DocumentStore(book())
        val before = store.current.page(0).items.size
        store.edit { it.addPart("new") }
        assertEquals(before + 1, store.current.page(0).items.size)
        store.undo()
        assertEquals(before, store.current.page(0).items.size)
    }

    @Test
    fun `a whole drag is one undo step, not sixty`() {
        val store = DocumentStore(book())
        val original = store.current

        store.beginGesture()
        repeat(60) { frame ->
            store.update { b ->
                b.mapPage(0) { p ->
                    p.copy(items = p.items.set(0, p.items[0].movedTo(10f + frame, 20f)))
                }
            }
        }
        store.endGesture()

        assertTrue(store.undo())
        assertEquals(original, store.current)
        assertFalse(store.canUndo)
    }

    @Test
    fun `a cancelled gesture leaves no trace`() {
        val store = DocumentStore(book())
        val original = store.current
        store.beginGesture()
        store.update { it.addPart("ghost") }
        store.cancelGesture()
        assertEquals(original, store.current)
        assertFalse(store.canUndo)
    }

    @Test
    fun `redo replays an undone edit and is cleared by a new one`() {
        val store = DocumentStore(book())
        store.edit { it.addPart("a") }
        val withA = store.current

        store.undo()
        assertTrue(store.canRedo)
        store.redo()
        assertEquals(withA, store.current)

        store.undo()
        store.edit { it.addPart("b") }
        assertFalse(store.canRedo)
    }

    @Test
    fun `history is capped and drops the oldest entry`() {
        val store = DocumentStore(book(), capacity = 3)
        repeat(10) { i -> store.edit { it.addPart("p$i") } }
        var undos = 0
        while (store.undo()) undos++
        assertEquals(3, undos)
    }

    @Test
    fun `a no-op edit does not consume a history slot`() {
        val store = DocumentStore(book())
        store.edit { it }
        assertFalse(store.canUndo)
    }

    @Test
    fun `undo on a fresh document is a no-op rather than a crash`() {
        val store = DocumentStore(book())
        assertFalse(store.undo())
        assertFalse(store.redo())
    }

    @Test
    fun `snapshots share structure instead of deep-copying the page`() {
        val store = DocumentStore(book())
        val strokesBefore = store.current.page(1).strokes
        store.edit { it.addPart("x") }
        // Page 1 was untouched, so its stroke list must be the very same instance.
        assertTrue(strokesBefore === store.current.page(1).strokes)
    }
}
