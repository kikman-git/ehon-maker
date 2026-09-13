package app.ehon.template

import app.ehon.model.Artwork
import app.ehon.model.BookId
import app.ehon.model.PartItem
import app.ehon.model.TextItem
import app.ehon.store.BookCodec
import app.ehon.vector.SvgParser
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** The assembled story documents in build/templates, as the clients will fetch them (decision #60). */
class StoryTemplatesTest {
    private val directory = File(requireNotNull(System.getProperty("ehon.templates")) { "run through Gradle: jvmTest sets ehon.templates" })
    private val index = Json.parseToJsonElement(directory.resolve("index.json").readText()).jsonObject

    @Test
    fun `the index lists every assembled story with its content-addressed url`() {
        val entries = index["templates"]!!.jsonArray.map { it.jsonObject }
        assertTrue(entries.size >= 5, "expected the five stories, found ${entries.size}")
        assertEquals(entries.map { it["id"]!!.jsonPrimitive.content }, entries.map { it["id"]!!.jsonPrimitive.content }.distinct())
        assertEquals("doc-love-letter", entries.first()["id"]!!.jsonPrimitive.content)
        entries.forEach { entry ->
            val id = entry["id"]!!.jsonPrimitive.content
            val file = directory.resolve(entry["file"]!!.jsonPrimitive.content)
            assertTrue(file.isFile, "$id: ${file.name} missing")
            val sha = entry["sha256"]!!.jsonPrimitive.content
            assertEquals("$id/${sha.take(12)}.ehon.json", entry["url"]!!.jsonPrimitive.content)
            assertEquals(file.length().toInt(), entry["bytes"]!!.jsonPrimitive.content.toInt(), "$id: bytes")
            assertEquals(4, entry["format"]!!.jsonPrimitive.content.toInt())
            val book = BookCodec.decode(file.readText())
            assertEquals(book.title, entry["title"]!!.jsonPrimitive.content)
            assertEquals(book.shape.name, entry["shape"]!!.jsonPrimitive.content)
            assertEquals(book.pageCount, entry["pageCount"]!!.jsonPrimitive.content.toInt())
            assertTrue(entry["description"]!!.jsonObject["ja"]!!.jsonPrimitive.content.isNotBlank(), "$id: description")
        }
    }

    @Test
    fun `every story opens, places only art it carries, paints every piece in full and stays within the sync budget`() {
        directory.listFiles { file -> file.name.endsWith(".ehon.json") }!!.forEach { file ->
            val book = BookCodec.decode(file.readText())
            assertTrue(book.pages.isNotEmpty(), file.name)
            val items = book.pages.flatMap { it.items }
            assertEquals(items.map { it.id }, items.map { it.id }.distinct(), "${file.name}: item ids repeat")
            items.filterIsInstance<PartItem>().forEach { item ->
                assertEquals(Artwork.CATEGORY, item.partId.category, "${file.name}: ${item.partId.value}")
                assertTrue(item.partId.name in book.art, "${file.name}: ${item.partId.value} is not in the book")
            }
            items.filterIsInstance<TextItem>().forEach { assertTrue('\n' !in it.text, "${file.name}: one text item per line") }
            book.art.forEach { (key, artwork) ->
                val parsed = SvgParser.cached(artwork.svg)
                assertTrue(parsed.layers.isNotEmpty(), "${file.name}: $key paints nothing")
                assertEquals(emptyList(), parsed.unsupported, "${file.name}: $key")
            }
            assertTrue(book.art.values.sumOf { it.svg.length } <= Artwork.MAX_TOTAL_SVG_CHARS, "${file.name}: art over the sync budget")
            assertEquals(book, BookCodec.decode(BookCodec.encode(book)))
        }
    }

    @Test
    fun `a shelf copy keeps the bound pages and art without sharing the story's identity`() {
        val json = directory.resolve("doc-love-letter.ehon.json").readText()
        val source = BookCodec.decode(json)
        val copy = Templates.instantiateDocument(json, BookId("my-love-letter"), 1234)
        assertEquals(source.copy(id = BookId("my-love-letter"), updatedAtEpochMs = 1234), copy)
        assertEquals(25, copy.pageCount)
        // Cover and title page first, then the storyboard's picture-left, words-right spreads, then the back cover.
        assertEquals(listOf("cover", "title", "p1", "p2"), copy.pages.take(4).map { it.id })
        assertEquals("back", copy.pages.last().id)
        assertTrue(copy.page(2).items.any { it is PartItem })
        assertTrue(copy.page(3).items.all { it is TextItem })
    }
}
