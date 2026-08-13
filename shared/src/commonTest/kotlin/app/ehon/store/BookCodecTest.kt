package app.ehon.store

import app.ehon.FakeMeasurer
import app.ehon.design.Organic
import app.ehon.engine.EditorController
import app.ehon.engine.EditorMode
import app.ehon.model.BookId
import app.ehon.model.PartId
import app.ehon.model.TextItem
import app.ehon.template.IdSource
import app.ehon.template.Templates
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue

class BookCodecTest {

    /** A book carrying every kind of content: parts, ruby text, strokes, an eraser. */
    private fun richBook() = EditorController(
        Templates.instantiate(
            template = Templates.find("t1")!!,
            bookId = BookId("b1"),
            title = "もりの ともだち",
            contentLocale = "ja-JP",
            nowEpochMs = 1_700_000_000_000L,
            idSource = IdSource("seed"),
        ),
        FakeMeasurer,
        IdSource("new"),
    ).apply {
        addPart(PartId("いきもの:くま"))
        rotateSelected()
        resizeSelected(bigger = true)
        setPageBackground(Organic.pageBackgrounds.last())
        setMode(EditorMode.TEXT)
        setDraftText("くまさんは もりへ いきました")
        setDraftRuby("くまさんは もりへ いきました")
        commitText()
        setMode(EditorMode.DRAW)
        setCrayon(4)
        beginStroke(0.1f, 0.2f)
        repeat(30) { appendStroke(0.1f + it / 100f, 0.3f) }
        endStroke()
        toggleEraser()
        beginStroke(0.5f, 0.5f)
        appendStroke(0.6f, 0.6f)
        endStroke()
    }.book

    @Test
    fun `a book survives a round trip byte for byte`() {
        val original = richBook()
        val restored = BookCodec.decode(BookCodec.encode(original))
        assertEquals(original, restored)
    }

    @Test
    fun `persistent collections survive as persistent collections`() {
        val restored = BookCodec.decode(BookCodec.encode(richBook()))
        // Not merely equal — the document model relies on these being persistent so that
        // snapshot history stays cheap. A plain List here would break undo's memory story.
        restored.pages.forEach { page ->
            assertTrue(page.items is kotlinx.collections.immutable.PersistentList<*>)
            assertTrue(page.strokes is kotlinx.collections.immutable.PersistentList<*>)
        }
        assertTrue(restored.pages is kotlinx.collections.immutable.PersistentList<*>)
    }

    @Test
    fun `every content kind is preserved`() {
        val restored = BookCodec.decode(BookCodec.encode(richBook()))
        val page = restored.page(0)

        val text = page.items.filterIsInstance<TextItem>().single()
        assertEquals("くまさんは もりへ いきました", text.text)
        assertEquals("くまさんは もりへ いきました", text.ruby)

        assertEquals(2, page.strokes.size)
        assertEquals(app.ehon.model.Ink.Eraser, page.strokes.last().ink)
        assertTrue(page.strokes.first().ink is app.ehon.model.Ink.Crayon)
        assertEquals(Organic.pageBackgrounds.last(), page.background)
    }

    @Test
    fun `shape, locale, binding and timestamp survive`() {
        val original = richBook()
        val restored = BookCodec.decode(BookCodec.encode(original))
        assertEquals(original.shape, restored.shape)
        assertEquals("ja-JP", restored.contentLocale)
        assertEquals(original.binding, restored.binding)
        assertEquals(original.updatedAtEpochMs, restored.updatedAtEpochMs)
    }

    @Test
    fun `a landscape book stays landscape`() {
        val landscape = Templates.instantiate(
            template = Templates.find("t2")!!,
            bookId = BookId("b2"),
            title = "うちゅう",
            contentLocale = "ja-JP",
            nowEpochMs = 0L,
        )
        assertEquals(landscape, BookCodec.decode(BookCodec.encode(landscape)))
    }

    @Test
    fun `a payload from a newer format is refused, not silently mangled`() {
        val forward = BookCodec.encode(richBook()).replace("\"version\":1", "\"version\":99")
        assertFailsWith<IllegalArgumentException> { BookCodec.decode(forward) }
        assertNull(BookCodec.decodeOrNull(forward))
    }

    @Test
    fun `garbage decodes to null rather than throwing at the call site`() {
        assertNull(BookCodec.decodeOrNull("not json at all"))
        assertNull(BookCodec.decodeOrNull(""))
    }

    /** Firestore's per-document ceiling is 1MiB; this is the page-per-doc justification. */
    @Test
    fun `a realistic book stays well inside the firestore document limit`() {
        val bytes = BookCodec.encode(richBook()).encodeToByteArray().size
        assertTrue(bytes < 400_000, "encoded book was $bytes bytes")
    }
}
