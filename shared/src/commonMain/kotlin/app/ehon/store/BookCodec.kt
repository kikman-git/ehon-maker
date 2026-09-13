package app.ehon.store

import app.ehon.design.Organic
import app.ehon.model.Artwork
import app.ehon.model.Book
import app.ehon.model.Ink
import app.ehon.model.Page
import app.ehon.vector.SvgParser
import kotlinx.collections.immutable.toPersistentList
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Serialises a [Book] for local storage, the `.ehon` archive, and Firestore.
 *
 * JSON rather than CBOR for v1: a book is ~150KB either way after stroke simplification,
 * and a readable file is worth far more when a parent emails you a broken book. Swap the
 * format behind this object if size ever bites.
 */
object BookCodec {

    const val ARCHIVE_EXTENSION = "ehon"

    /**
     * Bumped whenever the on-disk shape changes; [decode] refuses anything newer.
     *
     * 2: stroke crayons index [Organic.drawingCrayons] (14) instead of the nine-colour part
     *    ramp. Version-1 strokes are remapped on read via [Organic.LEGACY_CRAYON_REMAP].
     * 3: stable page ids and optional non-square part heights.
     * 4: embedded vector art (`book.art`, decision #55); page colours may be read from hex strings
     *    and text faces from picker ids, so a document can be written by hand or by a model.
     */
    const val FORMAT_VERSION = 4

    private val json = Json {
        // A file written by a newer build must not hard-fail an older one on a field it
        // simply does not know about.
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    fun encode(book: Book): String {
        validateIds(book)
        validateArt(book)
        return json.encodeToString(Envelope(FORMAT_VERSION, book))
    }

    /** @throws IllegalArgumentException if the payload is malformed or from a newer format. */
    fun decode(text: String): Book {
        val root = json.parseToJsonElement(text).jsonObject
        val version = root.getValue("version").jsonPrimitive.int
        checkVersion(version)
        if (version >= 3) {
            root.getValue("book").jsonObject["pages"]?.jsonArray?.forEach { page ->
                require(!page.jsonObject["id"]?.jsonPrimitive?.content.isNullOrBlank()) {
                    "a version-3 page must have a stable id"
                }
            }
        }
        val envelope = json.decodeFromString<Envelope>(text)
        var book = envelope.book
        if (version < 2) book = remapLegacyCrayons(book)
        if (version < 3) {
            book = book.copy(pages = book.pages.mapIndexed { index, page ->
                page.copy(id = "p${index + 1}")
            }.toPersistentList())
        }
        validateIds(book)
        validateArt(book)
        return book
    }

    fun encodePage(page: Page): String {
        validatePageId(page.id)
        return json.encodeToString(PageEnvelope(FORMAT_VERSION, page))
    }

    fun decodePage(text: String): Page {
        val root = json.parseToJsonElement(text).jsonObject
        val version = root.getValue("version").jsonPrimitive.int
        checkVersion(version)
        require(version >= 3) { "legacy pages must be migrated with their book" }
        require(!root.getValue("page").jsonObject["id"]?.jsonPrimitive?.content.isNullOrBlank())
        return json.decodeFromString<PageEnvelope>(text).page.also { validatePageId(it.id) }
    }

    private fun checkVersion(version: Int) {
        require(version in 1..FORMAT_VERSION) {
            "unsupported book format $version (this app supports 1..$FORMAT_VERSION)"
        }
    }

    private fun validateIds(book: Book) {
        book.pages.forEach { validatePageId(it.id) }
        require(book.pages.map { it.id }.distinct().size == book.pageCount) { "duplicate page ids" }
    }

    /** Every picture must parse now, so a broken document is refused rather than opened with a hole. */
    private fun validateArt(book: Book) {
        var total = 0
        book.art.forEach { (key, artwork) ->
            require(Artwork.isKey(key)) { "invalid art key '$key'" }
            require(artwork.svg.isNotBlank()) { "art '$key' is empty" }
            total += artwork.svg.length
            SvgParser.cached(artwork.svg)
        }
        require(total <= Artwork.MAX_TOTAL_SVG_CHARS) {
            "embedded art is $total characters; the limit is ${Artwork.MAX_TOTAL_SVG_CHARS}"
        }
    }

    private fun validatePageId(id: String) {
        require(id.isNotBlank() && '/' !in id && id != "." && id != "..") { "invalid page id" }
    }

    private fun remapLegacyCrayons(book: Book): Book = book.copy(
        pages = book.pages.map { page ->
            page.copy(
                strokes = page.strokes.map { stroke ->
                    val ink = stroke.ink
                    if (ink is Ink.Crayon) {
                        stroke.copy(ink = Ink.Crayon(Organic.LEGACY_CRAYON_REMAP[ink.index.coerceIn(Organic.LEGACY_CRAYON_REMAP.indices)]))
                    } else stroke
                }.toPersistentList(),
            )
        }.toPersistentList(),
    )

    fun decodeOrNull(text: String): Book? = runCatching { decode(text) }.getOrNull()

    @kotlinx.serialization.Serializable
    private data class Envelope(val version: Int, val book: Book)

    @kotlinx.serialization.Serializable
    private data class PageEnvelope(val version: Int, val page: Page)
}
