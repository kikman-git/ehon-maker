package app.ehon.engine

import app.ehon.FakeMeasurer
import app.ehon.design.Argb
import app.ehon.geom.Size
import app.ehon.model.Book
import app.ehon.model.BookId
import app.ehon.model.ItemId
import app.ehon.model.Page
import app.ehon.model.PageShape
import app.ehon.model.PartId
import app.ehon.model.PartItem
import app.ehon.model.TextItem
import kotlinx.collections.immutable.persistentListOf
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue

class DocumentReplaceTest {
    private val cat = PartItem(ItemId("cat"), 40f, 60f, partId = PartId("いきもの:ねこ"), sizePct = 30f)
    private val caption = TextItem(ItemId("t1"), 50f, 88f, text = "おはよう")
    private fun book(vararg pages: Page) = Book(BookId("b1"), "Cat", PageShape.SQUARE, "ja-JP", updatedAtEpochMs = 0, pages = persistentListOf(*pages))
    private val original = book(
        Page(Argb.hex("ffffff"), id = "p1", items = persistentListOf(cat, caption)),
        Page(Argb.hex("ffffff"), id = "p2", items = persistentListOf()),
    )

    @Test
    fun replacementIsOneUndoStepAndKeepsThePageById() {
        val controller = EditorController(original, FakeMeasurer, clock = { 99L })
        controller.goToPage(1)
        val revised = book(
            Page(Argb.hex("ffffff"), id = "p0", items = persistentListOf()),
            Page(Argb.hex("ffffff"), id = "p1", items = persistentListOf(cat.copy(sizePct = 45f), caption.copy(text = "こんばんは"))),
            Page(Argb.hex("fff0e0"), id = "p2", items = persistentListOf()),
        )
        controller.replaceDocument(revised)
        assertEquals(2, controller.pageIndex)
        assertEquals("p2", controller.page.id)
        assertEquals(99L, controller.book.updatedAtEpochMs)
        assertEquals("こんばんは", (controller.book.page(1).items[1] as TextItem).text)
        assertTrue(controller.canUndo)
        controller.undo()
        assertEquals(original, controller.book)
        assertEquals(1, controller.pageIndex)
        controller.redo()
        assertEquals(revised.pages, controller.book.pages)
    }

    @Test
    fun selectionSurvivesOnlyWhileItsItemDoes() {
        val controller = EditorController(original, FakeMeasurer)
        controller.selectItem(ItemId("cat"))
        controller.replaceDocument(book(Page(Argb.hex("ffffff"), id = "p1", items = persistentListOf(cat.copy(x = 20f), caption))))
        assertEquals(ItemId("cat"), controller.selectedId)
        assertEquals(20f, controller.selected?.x)
        controller.replaceDocument(book(Page(Argb.hex("ffffff"), id = "p1", items = persistentListOf(caption))))
        assertNull(controller.selectedId)
    }

    @Test
    fun aRemovedPageFallsBackToTheNearestIndex() {
        val controller = EditorController(original, FakeMeasurer)
        controller.goToPage(1)
        controller.replaceDocument(book(Page(Argb.hex("ffffff"), id = "p1", items = persistentListOf())))
        assertEquals(0, controller.pageIndex)
    }

    @Test
    fun anotherBookOrAnEmptyOneIsRefused() {
        val controller = EditorController(original, FakeMeasurer)
        assertFailsWith<IllegalArgumentException> { controller.replaceDocument(original.copy(id = BookId("other"))) }
        assertFailsWith<IllegalArgumentException> { controller.replaceDocument(original.copy(pages = persistentListOf())) }
        assertEquals(original, controller.book)
    }

    @Test
    fun itemBoundsCoverEveryItemOnThePageInPercent() {
        val controller = EditorController(original, FakeMeasurer)
        val bounds = controller.itemBounds(Size(400f, 400f))
        assertEquals(listOf(ItemId("cat"), ItemId("t1")), bounds.map { it.item.id })
        assertEquals(30f, bounds[0].w, 0.01f)
        assertEquals(30f, bounds[0].h, 0.01f)
        assertTrue(bounds[1].w > 0f && bounds[1].h > 0f)
    }
}
