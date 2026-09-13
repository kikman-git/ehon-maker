package app.ehon.store

import app.ehon.design.Argb
import app.ehon.model.Artwork
import app.ehon.model.FontFace
import app.ehon.model.PartId
import app.ehon.model.PartItem
import app.ehon.model.TextItem
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class CodecV4Test {
    @Test
    fun `a document written by hand decodes with hex colours face ids and embedded art`() {
        val book = BookCodec.decode(DOCUMENT)
        assertEquals(Argb.hex("f9f4ed"), book.page(0).background)
        assertEquals("こぐま", book.art.getValue("bear").name)
        val part = book.page(0).items[0] as PartItem
        assertEquals(PartId("art:bear"), part.partId)
        val text = book.page(0).items[1] as TextItem
        assertEquals(FontFace.ROUNDED, text.font)
        val encoded = BookCodec.encode(book)
        assertTrue(encoded.startsWith("{\"version\":4,"))
        assertEquals(book, BookCodec.decode(encoded))
    }

    @Test
    fun `older books decode without art and re-encode as version 4`() {
        val migrated = BookCodec.decode(CodecV3Test.V2)
        assertTrue(migrated.art.isEmpty())
        val encoded = BookCodec.encode(migrated)
        assertTrue("\"version\":4" in encoded)
        val asThree = encoded.replace("\"version\":4", "\"version\":3").replace("\"art\":{},", "")
        assertEquals(migrated, BookCodec.decode(asThree))
    }

    @Test
    fun `broken or oversized art is refused with the reason`() {
        assertFailsWith<IllegalArgumentException> { BookCodec.decode(DOCUMENT.replace("\"bear\":", "\"bad key!\":")) }
        assertFailsWith<IllegalArgumentException> { BookCodec.decode(DOCUMENT.replace("</svg>", "")) }
        val huge = DOCUMENT.replace("<circle", "<!-- ${"x".repeat(Artwork.MAX_TOTAL_SVG_CHARS)} --><circle")
        assertFailsWith<IllegalArgumentException> { BookCodec.decode(huge) }
        val book = BookCodec.decode(DOCUMENT)
        assertFailsWith<IllegalArgumentException> { BookCodec.encode(book.copy(art = mapOf("ok" to Artwork("<svg>")))) }
    }

    @Test
    fun `sync metadata carries the art and reassembles`() {
        val book = BookCodec.decode(DOCUMENT)
        val metadata = BookSyncCodec.metadata(book)
        assertTrue("\"bear\"" in metadata)
        assertEquals(book, BookSyncCodec.assembleOrNull(metadata, book.pages.map(BookCodec::encodePage)))
    }

    companion object {
        const val DOCUMENT = """{"version":4,"book":{"id":{"value":"doc"},"title":"ゆき","shape":"SQUARE","contentLocale":"ja-JP","updatedAtEpochMs":1,"art":{"bear":{"svg":"<svg viewBox=\"0 0 10 10\"><circle cx=\"5\" cy=\"5\" r=\"4\" fill=\"#a56f45\"/></svg>","name":"こぐま"}},"pages":[{"id":"p1","background":"#f9f4ed","items":[{"type":"part","id":{"value":"i1"},"x":50,"y":50,"partId":{"value":"art:bear"},"sizePct":30},{"type":"text","id":{"value":"i2"},"x":50,"y":85,"text":"しんしん","font":"maru","sizePct":5}]}]}}"""
    }
}
