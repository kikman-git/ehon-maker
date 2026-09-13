package app.ehon.store

import app.ehon.FakeMeasurer
import app.ehon.engine.EditorController
import app.ehon.model.Ink
import app.ehon.model.PartId
import app.ehon.model.PartItem
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotEquals
import kotlin.test.assertNull

class CodecV3Test {
    @Test
    fun `v2 migration assigns deterministic ids and preserves square geometry`() {
        val first = BookCodec.decode(V2)
        assertEquals(listOf("p1", "p2"), first.pages.map { it.id })
        assertEquals(first, BookCodec.decode(V2))
        assertNull((first.page(0).items.single() as PartItem).heightPct)
        assertEquals(first, BookCodec.decode(BookCodec.encode(first)))
    }

    @Test
    fun `v1 still remaps crayons as well as assigning page ids`() {
        val book = BookCodec.decode(V2.replace("\"version\":2", "\"version\":1"))
        assertEquals("p1", book.page(0).id)
        assertEquals(Ink.Crayon(app.ehon.design.Organic.LEGACY_CRAYON_REMAP[4]), book.page(0).strokes.single().ink)
    }

    @Test
    fun `reorder add undo and reopen never rename existing pages`() {
        val controller = EditorController(BookCodec.decode(V2), FakeMeasurer)
        controller.movePage(0, 1)
        controller.addPage()
        val newId = controller.page.id
        assertNotEquals("p1", newId)
        assertNotEquals("p2", newId)
        assertEquals(listOf("p2", "p1", newId), BookCodec.decode(BookCodec.encode(controller.book)).pages.map { it.id })
        controller.undo()
        controller.undo()
        assertEquals(listOf("p1", "p2"), controller.book.pages.map { it.id })
        controller.redo()
        controller.addPage()
        assertNotEquals(newId, controller.page.id)
    }

    @Test
    fun `non-square library and pack parts survive book and page round trips`() {
        val controller = EditorController(BookCodec.decode(V2), FakeMeasurer)
        listOf("lib:forest", "pack.friends:cat").forEach {
            controller.addPartAt(PartId(it), 50f, 40f, 80f, 30f)
        }
        assertEquals(controller.book, BookCodec.decode(BookCodec.encode(controller.book)))
        assertEquals(controller.page, BookCodec.decodePage(BookCodec.encodePage(controller.page)))
    }

    @Test
    fun `v3 missing or duplicate page ids are refused`() {
        val encoded = BookCodec.encode(BookCodec.decode(V2))
        assertFailsWith<IllegalArgumentException> { BookCodec.decode(encoded.replace(",\"id\":\"p1\"", "")) }
        assertFailsWith<IllegalArgumentException> { BookCodec.decode(encoded.replace("\"id\":\"p2\"", "\"id\":\"p1\"")) }
    }

    @Test
    fun `standalone pages enforce the same sync key rules as books`() {
        val page = BookCodec.decode(V2).page(0)
        val encoded = BookCodec.encodePage(page)
        for (id in listOf("", " ", "a/b", ".", "..")) {
            assertFailsWith<IllegalArgumentException> { BookCodec.encodePage(page.copy(id = id)) }
            assertFailsWith<IllegalArgumentException> { BookCodec.decodePage(encoded.replace("\"id\":\"p1\"", "\"id\":\"$id\"")) }
        }
    }

    @Test
    fun `unknown fields within v3 remain readable but unsupported formats are refused`() {
        val encoded = BookCodec.encode(BookCodec.decode(V2))
        val current = "\"version\":${BookCodec.FORMAT_VERSION}"
        assertEquals(BookCodec.decode(encoded), BookCodec.decode(encoded.replace(current, "\"futureField\":true,$current")))
        for (version in listOf(0, -1, BookCodec.FORMAT_VERSION + 1)) {
            assertFailsWith<IllegalArgumentException> { BookCodec.decode(encoded.replace(current, "\"version\":$version")) }
        }
    }

    companion object {
        // A literal old-format fixture: generating it with the current encoder would hide migration bugs.
        const val V2 = """{"version":2,"book":{"id":{"value":"legacy"},"title":"もり","shape":"LANDSCAPE","contentLocale":"ja-JP","updatedAtEpochMs":1700000000000,"pages":[{"background":-984607,"items":[{"type":"part","id":{"value":"i1"},"x":50,"y":50,"partId":{"value":"いきもの:ねこ"},"sizePct":26}],"strokes":[{"ink":{"type":"crayon","index":4},"brushStep":2,"points":[{"x":0.1,"y":0.2}]}]},{"background":-984607}]}}"""
    }
}
