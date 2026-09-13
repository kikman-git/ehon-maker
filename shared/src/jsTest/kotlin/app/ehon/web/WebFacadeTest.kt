package app.ehon.web

import app.ehon.model.BookId
import app.ehon.store.BookCodec
import app.ehon.template.Templates
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class WebFacadeTest {
    private val measure = { text: String, size: Double, _: String -> text.length * size * 0.6 }
    /** An eight-page square book with prompts on its untouched pages, like the retired seeded starter these tests were written against. */
    private val base = WebEditor(BookCodec.encode(Templates.instantiate(Templates.blank, BookId("sync-book"), "Sync", "ja-JP", 1000L)), measure).let { editor ->
        repeat(4) { editor.addPage() }
        editor.bookJson().also { editor.dispose() }
    }
    private fun other() = EhonCodec.blankBook("other", "", "ja-JP", 1.0, "SQUARE")

    @Test
    fun blankDrawingHasOnePageAndStrokesCommitOrCancelAsOneUndoStep() {
        val blank = EhonCodec.blankBook("drawing", "Drawing", "ja", 1000.0, "LANDSCAPE")
        val editor = WebEditor(blank, measure)
        assertEquals(1, editor.pageCount)
        assertEquals(1.5, editor.pageAspect)
        val original = editor.bookJson()
        editor.setCrayon(4)
        editor.setBrush(3)
        editor.beginStroke(0.2, 0.3)
        assertTrue(editor.isGestureActive)
        assertFailsWith<IllegalStateException> { editor.replaceBook(original) }
        editor.appendStroke(0.8, 0.7)
        editor.endStroke()
        assertFalse(editor.isGestureActive)
        val drawn = editor.bookJson()
        assertTrue(editor.canUndo)
        editor.undo()
        assertEquals(original, editor.bookJson())
        assertFalse(editor.canUndo)
        editor.redo()
        assertEquals(drawn, editor.bookJson())
        editor.setEraser(true)
        editor.beginStroke(0.4, 0.4)
        editor.appendStroke(0.6, 0.6)
        editor.cancelStroke()
        assertEquals(drawn, editor.bookJson())
        assertFalse(editor.isGestureActive)
        editor.replaceBook(drawn)
        assertEquals(4, editor.crayonIndex)
        assertEquals(3, editor.brushStep)
        assertTrue(editor.eraser)
        editor.dispose()
    }

    private fun edited(json: String, page: Int, text: String): String {
        val editor = WebEditor(json, measure)
        editor.goToPage(page)
        editor.setDraftText(text)
        assertTrue(editor.commitText())
        return editor.bookJson().also { editor.dispose() }
    }

    @Test
    fun splitBookReassemblesAndSummarises() {
        val pages = EhonCodec.pagesJson(base)
        assertEquals(8, pages.size)
        assertContentEquals(EhonCodec.pageIds(base), pages.map { Json.parseToJsonElement(it).jsonObject["page"]!!.jsonObject["id"]!!.jsonPrimitive.content }.toTypedArray())
        assertEquals(base, EhonCodec.assembleOrNull(EhonCodec.syncMetadata(base), pages))
        assertNull(EhonCodec.assembleOrNull(EhonCodec.syncMetadata(base), arrayOf("{}")))
        val summary = Json.parseToJsonElement(EhonCodec.summaryJson(base)).jsonObject
        assertEquals("sync-book", summary["id"]!!.jsonPrimitive.content)
        assertEquals(8, summary["pageCount"]!!.jsonPrimitive.content.toInt())
        assertEquals(0, summary["rasterParts"]!!.jsonArray.size)
    }

    @Test
    fun mergeKeepsDisjointEditsFromTwoDevices() {
        val local = edited(base, 0, "Local")
        val remote = edited(base, 1, "Remote")
        val merged = WebReader(EhonCodec.merge(local, base, remote), measure)
        assertEquals("Local", merged.speechText(0))
        assertEquals("Remote", merged.speechText(1))
        assertFailsWith<IllegalArgumentException> {
            EhonCodec.merge(local, base, other())
        }
    }

    @Test
    fun replaceBookKeepsThePageDropsHistoryAndAdvancesRevision() {
        val editor = WebEditor(base, measure)
        editor.goToPage(2)
        editor.addPartAt("かたち:まる", 40.0, 40.0, 20.0, null)
        assertTrue(editor.canUndo)
        val before = editor.revision
        val remote = edited(base, 2, "Remote")
        editor.replaceBook(remote)
        assertEquals(2, editor.pageIndex)
        assertFalse(editor.canUndo)
        assertTrue(editor.revision > before)
        assertEquals(remote, editor.bookJson())
        assertFailsWith<IllegalArgumentException> { editor.replaceBook(other()) }
        editor.dispose()
    }

    @Test
    fun readerExposesRasterDependenciesAndSpeech() {
        val editor = WebEditor(base, measure)
        editor.registerPart("lib:cat", "a/abc", 1.5, "ねこ", "Cat")
        editor.addPartAt("lib:cat", 50.0, 50.0, 30.0, editor.partHeightPct("lib:cat", 30.0))
        assertContentEquals(arrayOf("lib:cat"), editor.rasterPartIds())
        val reader = WebReader(editor.bookJson(), measure)
        assertContentEquals(arrayOf("lib:cat"), reader.rasterPartIds())
        assertEquals(editor.pageId(0), reader.pageId(0))
        assertNull(reader.replyJson(0))
        assertTrue(reader.speechText(0).isNotEmpty())
        assertFailsWith<IllegalArgumentException> { reader.registerPart("かたち:まる", "a/x", 1.0, "", "") }
        editor.dispose()
        reader.dispose()
    }

    @Test
    fun documentsCarryArtListItAndCheckReportsDanglingReferences() {
        val json = EhonCodec.instantiateDocument(app.ehon.store.CodecV4Test.DOCUMENT, "fresh", 5.0)
        val editor = WebEditor(json, measure)
        assertEquals("fresh", editor.bookId)
        val art = Json.parseToJsonElement(editor.artJson()).jsonArray
        assertEquals("art:bear", art.single().jsonObject["id"]!!.jsonPrimitive.content)
        assertEquals("こぐま", art.single().jsonObject["name"]!!.jsonPrimitive.content)
        assertEquals(30.0, editor.partHeightPct("art:bear", 30.0))
        assertEquals("こぐま", editor.partName("art:bear", "ja"))
        editor.addPartAt("art:bear", 20.0, 20.0, 10.0, editor.partHeightPct("art:bear", 10.0))
        assertEquals(3, Json.parseToJsonElement(editor.pageJson(0)).jsonObject["page"]!!.jsonObject["items"]!!.jsonArray.size)
        assertTrue(Json.parseToJsonElement(EhonCodec.checkDocument(json)).jsonObject["ok"]!!.jsonPrimitive.content.toBoolean())
        val broken = Json.parseToJsonElement(EhonCodec.checkDocument(json.replace("art:bear", "art:ghost"))).jsonObject
        assertFalse(broken["ok"]!!.jsonPrimitive.content.toBoolean())
        assertEquals(1, broken["errors"]!!.jsonArray.size)
        assertFalse(Json.parseToJsonElement(EhonCodec.checkDocument("nope")).jsonObject["ok"]!!.jsonPrimitive.content.toBoolean())
        editor.dispose()
    }

    @Test
    fun textByFaceListsEveryDrawnStringUnderItsFace() {
        val editor = WebEditor(base, measure)
        editor.setFont("kiwi")
        assertEquals("kiwi", editor.fontId)
        editor.setDraftText("森")
        editor.setDraftRuby("もり")
        assertTrue(editor.commitText())
        val byFace = Json.parseToJsonElement(EhonCodec.textByFace(editor.bookJson())).jsonObject
        assertEquals("森もり", byFace["kiwi"]!!.jsonPrimitive.content)
        // Untouched pages draw their prompt with the default face.
        assertTrue(byFace["yomogi"]!!.jsonPrimitive.content.isNotEmpty())
        val fonts = Json.parseToJsonElement(EhonCodec.fontsJson("ja")).jsonArray
        assertEquals(6, fonts.size)
        assertEquals("てがき", fonts[0].jsonObject["name"]!!.jsonPrimitive.content)
        editor.dispose()
    }
}
