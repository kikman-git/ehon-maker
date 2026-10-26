package app.ehon.engine

import app.ehon.FakeMeasurer
import app.ehon.catalog.PartCatalog
import app.ehon.design.Argb
import app.ehon.model.Book
import app.ehon.model.BookId
import app.ehon.model.ItemId
import app.ehon.model.Page
import app.ehon.model.PageShape
import app.ehon.model.PartDrawing
import app.ehon.model.PartId
import app.ehon.model.PartItem
import kotlinx.collections.immutable.persistentListOf
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse

class MaterialReplacementTest {
    private val old = PartItem(ItemId("old"), 31f, 64f, 27f, PartId("いきもの:くま"), 42f, 29f, PartDrawing())
    private val bird = old.copy(id = ItemId("bird"), partId = PartId("うみと そら:ことり"))
    private val book = Book(BookId("test"), "Migration", PageShape.SQUARE, "ja", pages = persistentListOf(
        Page(id = "first", background = Argb(0xffffffff.toInt()), items = persistentListOf(bird)),
        Page(id = "second", background = Argb(0xffffffff.toInt()), items = persistentListOf(old, bird)),
    ), updatedAtEpochMs = 0)

    @Test
    fun `only retired instances need replacement and geometry survives undo and redo`() {
        val editor = EditorController(book, FakeMeasurer)
        val retired = PartCatalog.retiredIn(book).single()
        assertEquals("second", retired.pageId)
        assertEquals(2, retired.pageNumber)
        assertEquals("くま", retired.name)
        val next = PartId("pack.storybook:owl")
        editor.replaceRetiredMaterial(retired.pageId, retired.itemId, next)
        assertEquals(persistentListOf(old.copy(partId = next), bird), editor.page.items)
        assertEquals(1, editor.pageIndex)
        assertEquals(old.id, editor.selectedId)
        assertEquals(emptyList(), PartCatalog.retiredIn(editor.book))
        editor.undo()
        assertEquals(book.pages, editor.book.pages)
        editor.redo()
        assertEquals(old.copy(partId = next), editor.book.page(1).items.first())
    }

    @Test
    fun `stale targets and unregistered replacements leave the document unchanged`() {
        val editor = EditorController(book, FakeMeasurer)
        editor.replaceRetiredMaterial("missing", "old", PartId("pack.storybook:owl"))
        editor.replaceRetiredMaterial("second", "missing", PartId("pack.storybook:owl"))
        editor.replaceRetiredMaterial("second", "old", PartId("art:missing"))
        editor.replaceRetiredMaterial("first", "bird", PartId("pack.storybook:owl"))
        assertEquals(book, editor.book)
        assertFalse(editor.canUndo)
    }
}
