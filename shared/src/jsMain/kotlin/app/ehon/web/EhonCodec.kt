@file:OptIn(ExperimentalJsExport::class)

package app.ehon.web

import app.ehon.catalog.PartCatalog
import app.ehon.design.Organic
import app.ehon.i18n.Strings
import app.ehon.model.Artwork
import app.ehon.model.BookId
import app.ehon.model.Book
import app.ehon.model.FontFace
import app.ehon.model.PageShape
import app.ehon.model.PartItem
import app.ehon.model.TextItem
import app.ehon.store.BookCodec
import app.ehon.store.BookSyncCodec
import app.ehon.template.Templates
import app.ehon.vector.SvgParser
import kotlinx.serialization.json.*

@JsExport
object EhonCodec {
    fun formatVersion(): Int = BookCodec.FORMAT_VERSION
    fun decodeOk(json: String): Boolean = BookCodec.decodeOrNull(json) != null
    fun migrate(json: String): String = BookCodec.encode(BookCodec.decode(json))

    /** A creator starts with one clean sheet, the same one the phone makes (decision #62). */
    fun blankBook(bookId: String, title: String, locale: String, nowEpochMs: Double, shape: String): String {
        require(nowEpochMs.isFinite() && nowEpochMs <= 9_007_199_254_740_991.0)
        return BookCodec.encode(Templates.blankBook(BookId(bookId), title, locale, nowEpochMs.toLong(), PageShape.valueOf(shape)))
    }

    // ── documents: a whole book, art included, written by a person or a model (decision #55) ──

    /** A document becomes a new book on this shelf: its own id, saved now, everything else as written. */
    fun instantiateDocument(json: String, bookId: String, nowEpochMs: Double): String {
        require(bookId.isNotBlank())
        require(nowEpochMs.isFinite() && nowEpochMs >= 0 && nowEpochMs <= 9_007_199_254_740_991.0)
        val book = BookCodec.decode(json)
        return BookCodec.encode(book.copy(id = BookId(bookId), updatedAtEpochMs = nowEpochMs.toLong()))
    }

    /** The `art:` pictures a document carries, as `[{id, name, aspect}]`. */
    fun artJson(bookJson: String): String = buildJsonArray {
        BookCodec.decode(bookJson).art.forEach { (key, artwork) -> addJsonObject {
            put("id", Artwork.partId(key).value)
            put("name", artwork.name.ifEmpty { key })
            put("aspect", SvgParser.cached(artwork.svg).aspect.toDouble())
        } }
    }.toString()

    /**
     * `{ok, errors, warnings}` for an author's loop: whether the document opens, which parts
     * point nowhere, which SVG features the painter skipped, which captions run off the page.
     */
    fun checkDocument(json: String): String {
        val errors = mutableListOf<String>()
        val warnings = mutableListOf<String>()
        val book = try { BookCodec.decode(json) } catch (e: Exception) {
            return report(false, listOf(e.message ?: "the document does not decode"), warnings)
        }
        val used = mutableSetOf<String>()
        book.pages.forEachIndexed { index, page ->
            val label = "page ${index + 1} (${page.id})"
            page.items.forEach { item ->
                when (item) {
                    is PartItem -> {
                        val id = item.partId
                        if (id.category == Artwork.CATEGORY) {
                            used += id.name
                            if (id.name !in book.art) errors += "$label: item ${item.id.value} uses art '${id.name}', which the book does not carry"
                        } else if (!WebParts.isRegistrable(id.value) && PartCatalog.find(id) == null) {
                            errors += "$label: item ${item.id.value} uses unknown part '${id.value}'"
                        }
                    }
                    is TextItem -> {
                        if ('\n' in item.text) warnings += "$label: text '${item.text.take(12)}…' contains a line break; a text item is one line, use one item per line"
                        // Full-width kana and kanji are one em; everything else about half. Same rule as FakeMeasurer.
                        val em = item.text.count { it.code > 0x2E7F } + item.text.count { it.code <= 0x2E7F } / 2f
                        val widthPct = em * item.sizePct * TextItem.OPTICAL_SCALE
                        if (widthPct > 96f) warnings += "$label: text '${item.text.take(12)}…' is about ${widthPct.toInt()}% of the page wide"
                    }
                }
            }
        }
        book.art.forEach { (key, artwork) ->
            val art = SvgParser.cached(artwork.svg)
            if (art.layers.isEmpty()) warnings += "art '$key' paints nothing"
            if (art.unsupported.isNotEmpty()) warnings += "art '$key' skipped: ${art.unsupported.joinToString(", ")}"
            if (key !in used) warnings += "art '$key' is not placed on any page (it still appears in the material list)"
        }
        val size = book.art.values.sumOf { it.svg.length }
        if (size > Artwork.MAX_TOTAL_SVG_CHARS * 3 / 4) warnings += "embedded art is $size of ${Artwork.MAX_TOTAL_SVG_CHARS} characters"
        return report(errors.isEmpty(), errors, warnings)
    }

    private fun report(ok: Boolean, errors: List<String>, warnings: List<String>): String = buildJsonObject {
        put("ok", ok)
        put("errors", buildJsonArray { errors.forEach { add(it) } })
        put("warnings", buildJsonArray { warnings.forEach { add(it) } })
    }.toString()

    /** `{id, title, shape, pageCount, contentLocale, updatedAtEpochMs, rasterParts}` for shelves. */
    fun summaryJson(bookJson: String): String {
        val book = BookCodec.decode(bookJson)
        return buildJsonObject {
            put("id", book.id.value)
            put("title", book.title)
            put("shape", book.shape.name)
            put("pageCount", book.pageCount)
            put("contentLocale", book.contentLocale)
            put("updatedAtEpochMs", book.updatedAtEpochMs)
            put("rasterParts", buildJsonArray { WebParts.rasterPartIds(book).forEach { add(it) } })
        }.toString()
    }

    // ── sync: the same assembly and merge rules as the phone, so no client owns them ──

    fun syncMetadata(bookJson: String): String = BookSyncCodec.metadata(BookCodec.decode(bookJson))
    fun pageIds(bookJson: String): Array<String> = BookCodec.decode(bookJson).pages.map { it.id }.toTypedArray()
    fun pagesJson(bookJson: String): Array<String> = BookCodec.decode(bookJson).pages.map(BookCodec::encodePage).toTypedArray()

    /** Null when the snapshot is malformed or incomplete; such a snapshot never replaces a local book. */
    fun assembleOrNull(metadata: String, pages: Array<String>): String? =
        BookSyncCodec.assembleOrNull(metadata, pages.toList())?.let(BookCodec::encode)

    fun merge(localJson: String, baselineJson: String?, remoteJson: String): String = BookCodec.encode(
        BookSyncCodec.merge(BookCodec.decode(localJson), baselineJson?.let(BookCodec::decode), BookCodec.decode(remoteJson)),
    )

    fun catalogJson(locale: String): String = buildJsonArray {
        val strings = Strings.forLocale(locale)
        PartCatalog.all.forEach { part -> addJsonObject {
            put("id", part.id.value)
            put("name", strings[part.nameKey])
            put("category", part.category)
        } }
    }.toString()

    fun backgroundsJson(): String = buildJsonArray {
        Organic.pageBackgrounds.forEach { add(it.packed) }
    }.toString()

    fun drawingColorsJson(): String = buildJsonArray {
        Organic.drawingCrayons.forEach { add(it.packed) }
    }.toString()

    /** `[{id, name}]` for the six selectable faces, in picker order. */
    fun fontsJson(locale: String): String = buildJsonArray {
        val strings = Strings.forLocale(locale)
        FontFace.selectable.forEach { face -> addJsonObject {
            put("id", face.id)
            put("name", strings[face.nameKey])
        } }
    }.toString()

    /**
     * Face id → every string drawn with that face (text, ruby and untouched-page prompts), so a
     * platform can load exactly the font slices a book needs before painting it.
     */
    fun textByFace(bookJson: String): String {
        val book = BookCodec.decode(bookJson)
        val strings = Strings.forLocale(book.contentLocale)
        val text = mutableMapOf<String, StringBuilder>()
        fun add(face: FontFace, value: String?) { if (!value.isNullOrEmpty()) text.getOrPut(face.id) { StringBuilder() }.append(value) }
        book.pages.forEach { page ->
            if (page.isUntouched) add(FontFace.default, page.promptKey?.let { strings[it] })
            page.items.filterIsInstance<TextItem>().forEach { add(it.font, it.text); add(it.font, it.ruby) }
        }
        return buildJsonObject { text.forEach { (id, value) -> put(id, value.toString()) } }.toString()
    }

    fun canvasFont(size: Double, id: String): String = cssFont(size, id)
}
