package app.ehon.template

import app.ehon.model.Artwork
import app.ehon.model.BookId
import app.ehon.model.PartItem
import app.ehon.model.TextItem
import app.ehon.store.BookCodec
import app.ehon.vector.SvgParser
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class DocumentTemplatesTest {
    @Test
    fun `a shelf copy preserves the facing pages and embedded art without sharing the template identity`() {
        val source = BookCodec.decode(requireNotNull(DocumentTemplates.find("doc-love-letter")).json)
        val copy = Templates.instantiateDocument("doc-love-letter", BookId("my-love-letter"), 1234)
        assertEquals(source.copy(id = BookId("my-love-letter"), updatedAtEpochMs = 1234), copy)
        assertEquals(25, copy.pageCount)
        // Cover and title page first, then the storyboard's picture-left, words-right spreads, then the back cover.
        assertEquals(listOf("cover", "title", "p1", "p2"), copy.pages.take(4).map { it.id })
        assertEquals("back", copy.pages.last().id)
        assertTrue(copy.page(0).items.any { it is PartItem })
        assertTrue(copy.page(2).items.any { it is PartItem })
        assertTrue(copy.page(3).items.all { it is TextItem })
        assertEquals("ja-JP", copy.contentLocale)
    }

    @Test
    fun `every document template opens, places only art it carries and paints every piece in full`() {
        assertTrue(DocumentTemplates.all.isNotEmpty())
        DocumentTemplates.all.forEach { entry ->
            val book = BookCodec.decode(entry.json)
            assertTrue(book.pages.isNotEmpty(), entry.id)
            val items = book.pages.flatMap { it.items }
            items.filterIsInstance<PartItem>().forEach { item ->
                assertEquals(Artwork.CATEGORY, item.partId.category, "${entry.id}: ${item.partId.value}")
                assertTrue(item.partId.name in book.art, "${entry.id}: ${item.partId.value} is not in the book")
            }
            items.filterIsInstance<TextItem>().forEach { assertTrue('\n' !in it.text, "${entry.id}: one text item per line") }
            book.art.forEach { (key, artwork) ->
                val parsed = SvgParser.cached(artwork.svg)
                assertTrue(parsed.layers.isNotEmpty(), "${entry.id}: $key paints nothing")
                assertEquals(emptyList(), parsed.unsupported, "${entry.id}: $key")
            }
            assertEquals(book, BookCodec.decode(BookCodec.encode(book)))
        }
    }
}
