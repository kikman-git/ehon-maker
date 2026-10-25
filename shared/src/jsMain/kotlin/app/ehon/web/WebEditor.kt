@file:OptIn(ExperimentalJsExport::class)

package app.ehon.web

import app.ehon.design.Argb
import app.ehon.engine.EditorController
import app.ehon.engine.EditorIntentBatch
import app.ehon.engine.UiLevel
import app.ehon.geom.Size
import app.ehon.i18n.Strings
import app.ehon.model.Artwork
import app.ehon.model.FontFace
import app.ehon.model.ItemId
import app.ehon.model.Page
import app.ehon.model.PartId
import app.ehon.model.PartItem
import app.ehon.model.Stroke
import app.ehon.model.TextItem
import app.ehon.scene.RenderTarget
import app.ehon.scene.SceneBuilder
import app.ehon.store.BookCodec
import app.ehon.template.IdSource
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.collections.immutable.persistentListOf
import org.w3c.dom.CanvasRenderingContext2D
import org.w3c.dom.HTMLImageElement
import kotlin.js.Date

@JsExport
class WebEditor(bookJson: String, measure: (String, Double, String) -> Double) {
    private val measurer = CachedMeasurer(measure)
    private val idSource = IdSource("web-${Date.now().toLong()}-")
    private val clock = { Date.now().toLong() }
    private var controller = newController(BookCodec.decode(bookJson))
    private val parts = WebParts { controller.book.art }
    private val builder = SceneBuilder(measurer, parts.resolver)
    private val painter = CanvasPainter { parts.imageProvider(it) }
    private var resourceRevision = 0

    val revision: Int get() = controller.revision + resourceRevision
    val pageIndex: Int get() = controller.pageIndex
    val pageCount: Int get() = controller.book.pageCount
    val pageAspect: Double get() = controller.book.shape.aspect.toDouble()
    val bookId: String get() = controller.book.id.value
    val title: String get() = controller.book.title
    val updatedAtEpochMs: Double get() = controller.book.updatedAtEpochMs.toDouble()
    val isGestureActive: Boolean get() = controller.isGestureActive
    val selectedId: String? get() = controller.selectedId?.value
    val selectedX: Double? get() = controller.selected?.x?.toDouble()
    val selectedY: Double? get() = controller.selected?.y?.toDouble()
    val selectedText: String? get() = (controller.selected as? TextItem)?.text
    val selectedRuby: String? get() = (controller.selected as? TextItem)?.ruby
    val selectedPartId: String? get() = (controller.selected as? PartItem)?.partId?.value
    val isEditingIllustration: Boolean get() = controller.isEditingIllustration
    /** The face new text will use; selecting a text item adopts its face. */
    val fontId: String get() = controller.fontFace.id
    val textSizePct: Float get() = controller.textSizePct
    val minTextSizePct: Float get() = TextItem.MIN_SIZE_PCT
    val maxTextSizePct: Float get() = TextItem.MAX_SIZE_PCT
    val textBold: Boolean get() = controller.textBold
    val textLineHeight: Float get() = controller.textLineHeight
    val minLineHeight: Float get() = TextItem.MIN_LINE_HEIGHT
    val maxLineHeight: Float get() = TextItem.MAX_LINE_HEIGHT
    val textColorIndex: Int get() = controller.textColorIndex
    val textColor: Int get() = controller.textColor.packed
    val hasCustomTextColor: Boolean get() = controller.customTextColor != null
    val clipboardType: String get() = app.ehon.engine.ItemClip.MIME
    val canUndo: Boolean get() = controller.canUndo
    val canRedo: Boolean get() = controller.canRedo
    val crayonIndex: Int get() = controller.crayonIndex
    val brushColor: Int get() = controller.brushColor.packed
    val hasCustomInk: Boolean get() = controller.hasCustomInk
    val brushStep: Float get() = controller.brushStep
    val minBrushStep: Float get() = Stroke.MIN_BRUSH_STEP
    val maxBrushStep: Float get() = Stroke.MAX_BRUSH_STEP
    val eraser: Boolean get() = controller.eraser

    fun bookJson(): String = BookCodec.encode(controller.book)
    fun pageJson(i: Int): String = BookCodec.encodePage(controller.book.pages[checkedPage(i)])
    fun pageId(i: Int): String = controller.book.pages[checkedPage(i)].id
    fun rasterPartIds(): Array<String> = WebParts.rasterPartIds(controller.book)
    /** The book's embedded pictures as `[{id, name, aspect}]`; empty for a book without art. */
    fun artJson(): String = parts.artJson()
    fun goToPage(i: Int) = controller.goToPage(checkedPage(i))
    fun addPage() = controller.addPage()
    fun movePage(from: Int, to: Int) = controller.movePage(checkedPage(from), checkedPage(to))
    fun addPartAt(partId: String, xPct: Double, yPct: Double, sizePct: Double, heightPct: Double?) {
        require(parts.resolver.find(PartId(partId)) != null) { "unregistered part $partId" }
        controller.addPartAt(PartId(partId), xPct.toFloat(), yPct.toFloat(), sizePct.toFloat(), heightPct?.toFloat())
    }
    fun partHeightPct(partId: String, sizePct: Double): Double? =
        parts.aspect(partId)?.let { sizePct * pageAspect / it }

    fun selectAt(xPct: Double, yPct: Double, w: Double, h: Double): String? {
        require(xPct.isFinite() && yPct.isFinite())
        return controller.selectAt(xPct.toFloat(), yPct.toFloat(), size(w, h))?.id?.value
    }
    fun clearSelection() = controller.clearSelection()
    fun beginDrag() = controller.beginDrag()
    fun dragTo(x: Double, y: Double) = controller.dragTo(x.toFloat(), y.toFloat())
    fun rotateTo(deg: Double) = controller.rotateSelectedTo(deg.toFloat())
    fun endDrag() = controller.endDrag()
    fun cancelDrag() = controller.cancelDrag()
    fun resizeSelected(bigger: Boolean) = controller.resizeSelected(bigger)
    fun rotateSelected() = controller.rotateSelected()
    fun deleteSelected() = controller.deleteSelected()
    fun bringForward() = controller.bringForward()
    fun sendBackward() = controller.sendBackward()
    fun setPageBackground(argb: Int) = controller.setPageBackground(Argb(argb))
    fun setDraftText(s: String) = controller.setDraftText(s)
    fun setDraftRuby(s: String) = controller.setDraftRuby(s)
    fun setTextSize(step: Int) = controller.setTextSize(step)
    fun setFont(id: String) = controller.setFont(FontFace.fromId(id))
    fun setTextColour(i: Int) = controller.setTextColour(i)
    fun setTextSizePct(pct: Float) = controller.setTextSizePct(pct)
    fun setBold(on: Boolean) = controller.setBold(on)
    fun setLineHeight(ems: Float) = controller.setLineHeight(ems)
    fun setCustomTextColour(argb: Int) = controller.setCustomTextColour(Argb(argb))

    /** `[centreX, centreY, width, height]` of the unrotated selection in page percent, then its angle; null without one. */
    fun selectedBounds(w: Double, h: Double): Array<Double>? {
        val id = controller.selectedId ?: return null
        val bounds = controller.itemBounds(size(w, h)).firstOrNull { it.item.id == id } ?: return null
        return arrayOf(bounds.item.x.toDouble(), bounds.item.y.toDouble(), bounds.w.toDouble(), bounds.h.toDouble(), bounds.item.rotationDeg.toDouble())
    }

    fun copySelected(): String? = controller.copySelected()
    fun paste(clip: String): Boolean = controller.paste(clip)
    fun pasteText(text: String): Boolean = controller.pasteText(text)
    fun moveSelectedToPage(target: Int, xPct: Double?, yPct: Double?) =
        controller.moveSelectedToPage(checkedPage(target), xPct?.toFloat(), yPct?.toFloat())
    fun commitText(): Boolean = controller.commitText()

    fun setCrayon(index: Int) = controller.setCrayon(index)
    fun setBrushColor(argb: Int) = controller.setBrushColor(Argb(argb))
    fun beginIllustrationEdit() = controller.beginIllustrationEdit()
    fun endIllustrationEdit() = controller.endIllustrationEdit()
    fun setBrush(step: Float) = controller.setBrush(step)
    fun setEraser(enabled: Boolean) {
        if (controller.eraser != enabled) controller.toggleEraser()
    }

    /** Normalised page coordinates; one pointer gesture is one undo step. */
    fun beginStroke(x: Double, y: Double) {
        check(!controller.isGestureActive) { "finish the current gesture first" }
        require(x.isFinite() && y.isFinite())
        if (!controller.isEditingIllustration) controller.clearSelection()
        controller.beginStroke(x.toFloat().coerceIn(0f, 1f), y.toFloat().coerceIn(0f, 1f))
    }
    fun appendStroke(x: Double, y: Double) {
        check(controller.isGestureActive) { "begin a stroke first" }
        require(x.isFinite() && y.isFinite())
        controller.appendStroke(x.toFloat().coerceIn(0f, 1f), y.toFloat().coerceIn(0f, 1f))
    }
    fun endStroke() {
        check(controller.isGestureActive) { "begin a stroke first" }
        controller.endStroke()
    }
    fun cancelStroke() = controller.cancelDrag()

    /** The response must identify the exact book revision that was sent to the service. */
    fun applyIntents(json: String) {
        val batch = Json.decodeFromString<EditorIntentBatch>(json)
        require(batch.bookId == bookId && batch.revision == revision) { "stale intents" }
        batch.intents.filterIsInstance<app.ehon.engine.EditorIntent.AddPart>().forEach {
            require(parts.resolver.find(PartId(it.partId)) != null) { "unregistered part ${it.partId}" }
        }
        controller.applyBatch(batch.intents)
    }

    /** A revision of the open book from an AI or a file, applied as one undo step. */
    fun applyDocument(json: String) {
        val book = BookCodec.decode(json)
        controller.replaceDocument(book)
    }

    /** The current page's items as `[{id, kind, ref, x, y, w, h, rotationDeg}]` in percent, measured at w×h. */
    fun itemBoundsJson(w: Double, h: Double): String = buildJsonArray {
        controller.itemBounds(size(w, h)).forEach { bounds ->
            val item = bounds.item
            add(buildJsonObject {
                put("id", item.id.value)
                put("kind", if (item is TextItem) "text" else "part")
                put("ref", (item as? TextItem)?.text ?: (item as PartItem).partId.value)
                put("x", item.x.toDouble())
                put("y", item.y.toDouble())
                put("w", bounds.w.toDouble())
                put("h", bounds.h.toDouble())
                put("rotationDeg", item.rotationDeg.toDouble())
            })
        }
    }.toString()

    fun undo() = controller.undo()
    fun redo() = controller.redo()

    /**
     * Sync replaces the whole document once a gesture is over. Undo history is dropped so
     * a local undo can never reverse another device's edit; the visible page is kept by id.
     */
    fun replaceBook(json: String) {
        check(!controller.isGestureActive) { "finish the current gesture before replacing the book" }
        val book = BookCodec.decode(json)
        require(book.id == controller.book.id) { "a different book cannot replace the open one" }
        val pageId = controller.page.id
        val previous = controller.revision
        val crayon = controller.crayonIndex
        val brush = controller.brushStep
        val erasing = controller.eraser
        val customColor = controller.brushColor.takeIf { controller.hasCustomInk }
        val selected = controller.selectedId
        val editing = controller.isEditingIllustration
        controller = newController(book).apply {
            setCrayon(crayon)
            customColor?.let { setBrushColor(it) }
            setBrush(brush)
            if (erasing) toggleEraser()
        }
        book.pages.indexOfFirst { it.id == pageId }.takeIf { it >= 0 }?.let { controller.goToPage(it) }
        if (selected != null && controller.page.id == pageId && controller.page.items.any { it.id == selected }) {
            controller.selectItem(selected)
            if (editing && controller.selected is PartItem) controller.beginIllustrationEdit()
        }
        resourceRevision += previous + 1
    }

    fun render(ctx: CanvasRenderingContext2D, w: Double, h: Double, pageIndex: Int, forExport: Boolean) {
        val pageSize = size(w, h)
        val page = controller.book.pages[checkedPage(pageIndex)]
        val target = RenderTarget(
            pageSize, if (forExport) RenderTarget.Kind.SHARE else RenderTarget.Kind.SCREEN,
            selectedItem = controller.selectedId.takeIf { pageIndex == controller.pageIndex },
        )
        val prompt = page.promptKey?.let { Strings.forLocale(controller.book.contentLocale)[it] }
        painter.draw(builder.build(page, target, prompt, controller.book.art), ctx)
    }

    /** Material tiles show the same resolved artwork as the page, without editing the book. */
    fun renderPart(ctx: CanvasRenderingContext2D, w: Double, h: Double, partId: String) {
        require(parts.resolver.find(PartId(partId)) != null) { "unregistered part $partId" }
        val page = Page(background = Argb(0), items = persistentListOf(PartItem(
            id = ItemId("preview"), partId = PartId(partId), x = 50f, y = 50f, sizePct = 70f,
        )))
        painter.draw(builder.build(page, RenderTarget(size(w, h), RenderTarget.Kind.SCREEN), null, controller.book.art), ctx)
    }

    /** A picture that is not in the book yet, painted as it would sit on a page. */
    fun renderSvg(ctx: CanvasRenderingContext2D, w: Double, h: Double, svg: String) {
        val page = Page(background = Argb(0), items = persistentListOf(PartItem(
            id = ItemId("preview"), partId = Artwork.partId(PREVIEW_KEY), x = 50f, y = 50f, sizePct = 100f,
        )))
        painter.draw(builder.build(page, RenderTarget(size(w, h), RenderTarget.Kind.SCREEN), null, mapOf(PREVIEW_KEY to Artwork(svg))), ctx)
    }

    fun artSvg(partId: String): String? = PartId(partId).takeIf { it.category == Artwork.CATEGORY }?.let { controller.book.art[it.name]?.svg }
    val artChars: Int get() = controller.book.art.values.sumOf { it.svg.length }
    val maxArtChars: Int get() = Artwork.MAX_TOTAL_SVG_CHARS

    /** The new part id, or null when the picture will not parse or the book has no room for it. */
    fun addArt(name: String, svg: String, placeSizePct: Double?): String? =
        controller.addArt(name, svg, placeSizePct?.toFloat())?.value

    fun registerPart(partId: String, assetRef: String, aspect: Double, nameJa: String, nameEn: String) {
        parts.register(partId, assetRef, aspect, nameJa, nameEn)
        resourceRevision++
    }

    fun partName(partId: String, locale: String): String = parts.name(partId, locale)

    fun setImageProvider(provider: (String) -> HTMLImageElement?) {
        parts.imageProvider = provider
        resourceRevision++
    }
    fun clearMeasurements() {
        measurer.clear()
        resourceRevision++
    }
    fun dispose() {
        controller.cancelDrag()
        painter.dispose()
        measurer.clear()
        parts.clear()
    }

    private fun newController(book: app.ehon.model.Book) =
        EditorController(book, measurer, idSource, clock).apply {
            setUiLevel(UiLevel.ADULT)
            setCrayon(6)
            setBrush(1f)
        }

    private fun checkedPage(index: Int): Int {
        require(index in controller.book.pages.indices) { "page index out of range" }
        return index
    }

    private fun size(w: Double, h: Double): Size {
        require(w.isFinite() && h.isFinite() && w > 0 && h > 0 && w <= 8192 && h <= 8192)
        return Size(w.toFloat(), h.toFloat())
    }
}

private const val PREVIEW_KEY = "preview"
