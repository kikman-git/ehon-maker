package app.ehon.template

import app.ehon.design.Argb
import app.ehon.model.BookId
import app.ehon.model.PageShape
import app.ehon.store.BookCodec
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** The blank start both shelves offer (decision #62): one untouched white page. */
class BlankBookTest {
    @Test
    fun `a blank book is one untouched white page in the asked shape`() {
        val book = Templates.blankBook(BookId("b-1"), "なまえの ない えほん", "ja-JP", 1234)
        assertEquals(PageShape.SQUARE, book.shape)
        assertEquals("なまえの ない えほん", book.title)
        assertEquals("ja-JP", book.contentLocale)
        assertEquals(1234, book.updatedAtEpochMs)
        val page = book.pages.single()
        assertEquals("p1", page.id)
        assertEquals(Argb.hex("ffffff"), page.background)
        assertNull(page.promptKey)
        assertTrue(page.items.isEmpty() && page.strokes.isEmpty())
        assertEquals(book, BookCodec.decode(BookCodec.encode(book)))
        assertEquals(PageShape.PORTRAIT, Templates.blankBook(BookId("b-2"), "t", "en-US", 0, PageShape.PORTRAIT).shape)
        assertFailsWith<IllegalArgumentException> { Templates.blankBook(BookId(" "), "t", "ja-JP", 0) }
        assertFailsWith<IllegalArgumentException> { Templates.blankBook(BookId("b-3"), "t", "ja-JP", -1) }
    }
}
