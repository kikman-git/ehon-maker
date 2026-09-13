@file:OptIn(ExperimentalJsExport::class)

package app.ehon.web

import app.ehon.geom.Size
import app.ehon.i18n.Strings
import app.ehon.model.Book
import app.ehon.model.TextItem
import app.ehon.scene.RenderTarget
import app.ehon.scene.SceneBuilder
import app.ehon.store.BookCodec
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.w3c.dom.CanvasRenderingContext2D
import org.w3c.dom.HTMLImageElement

/** A book for reading and thumbnails: no history, no selection, no mutation. */
@JsExport
class WebReader(bookJson: String, measure: (String, Double, String) -> Double) {
    private var book: Book = BookCodec.decode(bookJson)
    private val measurer = CachedMeasurer(measure)
    private val parts = WebParts().apply { art = book.art }
    private val builder = SceneBuilder(measurer, parts.resolver)
    private val painter = CanvasPainter { parts.imageProvider(it) }
    private var resourceRevision = 0

    val revision: Int get() = resourceRevision
    val bookId: String get() = book.id.value
    val title: String get() = book.title
    val contentLocale: String get() = book.contentLocale
    val pageCount: Int get() = book.pageCount
    val pageAspect: Double get() = book.shape.aspect.toDouble()
    val updatedAtEpochMs: Double get() = book.updatedAtEpochMs.toDouble()

    fun pageId(i: Int): String = book.pages[checkedPage(i)].id
    fun rasterPartIds(): Array<String> = WebParts.rasterPartIds(book)

    /** `{from, seconds, audioRef}` for a family voice on the page, or null. */
    fun replyJson(i: Int): String? = book.pages[checkedPage(i)].reply?.let { reply ->
        buildJsonObject {
            put("from", reply.from)
            put("seconds", reply.seconds.toDouble())
            put("audioRef", reply.audioRef)
        }.toString()
    }

    /** The page's text items in order, or its prompt when it has none — the iOS よみあげ rule. */
    fun speechText(i: Int): String {
        val page = book.pages[checkedPage(i)]
        val separator = if (book.isJapanese) "。" else ". "
        val text = page.items.filterIsInstance<TextItem>().joinToString(separator) { it.text }
        return text.ifEmpty { page.promptKey?.let { Strings.forLocale(book.contentLocale)[it] } ?: "" }
    }

    fun replaceBook(json: String) {
        val next = BookCodec.decode(json)
        require(next.id == book.id) { "a different book cannot replace the open one" }
        book = next
        parts.art = next.art
        resourceRevision++
    }

    fun render(ctx: CanvasRenderingContext2D, w: Double, h: Double, pageIndex: Int) {
        require(w.isFinite() && h.isFinite() && w > 0 && h > 0 && w <= 8192 && h <= 8192)
        val page = book.pages[checkedPage(pageIndex)]
        val target = RenderTarget(Size(w.toFloat(), h.toFloat()), RenderTarget.Kind.SCREEN)
        painter.draw(builder.build(page, target, null, book.art), ctx)
    }

    fun registerPart(partId: String, assetRef: String, aspect: Double, nameJa: String, nameEn: String) {
        parts.register(partId, assetRef, aspect, nameJa, nameEn)
        resourceRevision++
    }

    fun setImageProvider(provider: (String) -> HTMLImageElement?) {
        parts.imageProvider = provider
        resourceRevision++
    }

    fun clearMeasurements() {
        measurer.clear()
        resourceRevision++
    }

    fun dispose() {
        painter.dispose()
        measurer.clear()
        parts.clear()
    }

    private fun checkedPage(index: Int): Int {
        require(index in book.pages.indices) { "page index out of range" }
        return index
    }
}
