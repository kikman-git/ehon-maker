package app.ehon.engine

import app.ehon.design.Argb
import app.ehon.model.Artwork
import app.ehon.geom.Size
import app.ehon.model.Book
import app.ehon.model.FontFace
import app.ehon.model.Ink
import app.ehon.model.Item
import app.ehon.model.ItemId
import app.ehon.model.Page
import app.ehon.model.PartId
import app.ehon.model.PartItem
import app.ehon.model.PartDrawing
import app.ehon.model.PartStroke
import app.ehon.model.Stroke
import app.ehon.model.StrokePoint
import app.ehon.model.TextItem
import app.ehon.scene.TextMeasurer
import app.ehon.template.IdSource
import kotlinx.collections.immutable.persistentListOf
import kotlinx.collections.immutable.toPersistentList
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin

/** The editor's three tools. Model 1a: exactly three, always visible, never overlapping. */
enum class EditorMode { STICK, DRAW, TEXT }

/**
 * こども / おとな — model 2a's basic/advanced switch. Not a kid/parent *mode* split
 * (decision #12): one surface, and [ADULT] simply reveals furigana, z-order and send
 * settings. [KID] also implies big targets on the platform side.
 */
enum class UiLevel { KID, ADULT }

/**
 * Every editing intent the UI can express, and the only place the document is mutated.
 *
 * This is not a convenience layer. Swift cannot safely construct `Page`/`Book` values —
 * an `NSArray` does not convert to the `PersistentList` the constructors declare — so
 * mutation *must* live in Kotlin. The upside is that editor semantics are written and
 * tested once rather than reimplemented per platform.
 *
 * [revision] increments on every change, so a UI can treat the controller as an opaque
 * box and simply re-read after each call rather than diffing.
 */
class EditorController(
    initial: Book,
    private val measurer: TextMeasurer,
    private val idSource: IdSource = IdSource(),
    private val clock: () -> Long = { 0L },
) {
    private val store = DocumentStore(initial)
    private val hitTest = HitTest(measurer)

    init {
        require(initial.pages.isNotEmpty()) { "an editor needs at least one page" }
    }

    var revision: Int = 0
        private set

    val book: Book get() = store.current
    val canUndo: Boolean get() = store.canUndo
    val canRedo: Boolean get() = store.canRedo
    /** Sync waits for a gesture to finish before replacing the controller's document. */
    val isGestureActive: Boolean get() = store.isGestureActive

    var pageIndex: Int = 0
        private set

    var selectedId: ItemId? = null
        private set

    private var editingPartId: ItemId? = null
    val isEditingIllustration: Boolean get() = editingPartId != null
    private var strokePage: Int? = null
    private var strokePart: PartItem? = null

    var mode: EditorMode = EditorMode.STICK
        private set

    var category: String = app.ehon.catalog.PartCatalog.categories.first()
        private set

    var crayonIndex: Int = 1
        private set
    private var customInk: Argb? = null
    val hasCustomInk: Boolean get() = customInk != null
    val brushColor: Argb get() = customInk ?: app.ehon.design.Organic.drawingCrayons[crayonIndex]

    var brushStep: Float = 2f
        private set

    var eraser: Boolean = false
        private set

    /** 1..3, indexing [TextItem.SIZES]; the nearest step when [textSizePct] is a free size. */
    var textSizeStep: Int = 2
        private set

    var textSizePct: Float = TextItem.SIZES[1]
        private set

    var textBold: Boolean = false
        private set

    var textLineHeight: Float = TextItem.DEFAULT_LINE_HEIGHT
        private set

    /** Overrides [textColorIndex] when set; picking a preset clears it, like the brush's custom ink. */
    var customTextColor: Argb? = null
        private set
    val textColor: Argb get() = customTextColor ?: app.ehon.design.Organic.textColors[textColorIndex]

    /**
     * Indexes [app.ehon.design.Organic.textColors] — deliberately *not* [crayonIndex].
     *
     * The crayon palette has nine entries including cream, which is the page ground colour
     * and therefore invisible as text. The text palette has five, all legible on a light
     * page. Sharing one index between them made a drawing choice restyle text and could
     * select a colour that could not be seen.
     */
    var textColorIndex: Int = 0
        private set

    var uiLevel: UiLevel = UiLevel.KID
        private set

    /** Face for the next text item; follows the selection so a font tap is never a no-op. */
    var fontFace: FontFace = FontFace.default
        private set

    var draftText: String = ""
        private set

    var draftRuby: String = ""
        private set

    var furiganaEnabled: Boolean = true
        private set

    var toast: String? = null
        private set

    val page: Page get() = book.page(pageIndex)
    val selected: Item? get() = selectedId?.let { id -> page.items.firstOrNull { it.id == id } }
    val isTextSelected: Boolean get() = selected is TextItem

    val isAdult: Boolean get() = uiLevel == UiLevel.ADULT

    /**
     * Furigana is a Japanese-only concept, so the field only exists for a Japanese book —
     * and only in おとな, where the person typing can read kanji in the first place.
     */
    val showFuriganaField: Boolean get() = book.isJapanese && furiganaEnabled && isAdult

    /** まえ / うしろ are adult-only controls, and meaningless with one item on the page. */
    val canReorder: Boolean get() = isAdult && selected != null && page.items.size > 1

    val canBringForward: Boolean
        get() = canReorder && selectedId?.let { page.indexOf(it) } != page.items.lastIndex

    val canSendBackward: Boolean
        get() = canReorder && selectedId?.let { page.indexOf(it) } != 0

    // ── navigation ───────────────────────────────────────────────────────────

    fun goToPage(index: Int) = change {
        pageIndex = index.coerceIn(0, book.pageCount - 1)
        selectedId = null
    }

    fun addPage() = change {
        store.edit { current ->
            current.copy(
                pages = current.pages.add(
                    Page(background = current.page(current.pageCount - 1).background),
                ),
                updatedAtEpochMs = clock(),
            )
        }
        pageIndex = book.pageCount - 1
        selectedId = null
        toast = TOAST_PAGE_ADDED
    }

    /** ならびかえ is an おとな control (2a), and meaningless with a single page. */
    val canReorderPages: Boolean get() = isAdult && book.pageCount > 1

    /**
     * Moves one page to another slot. The current page follows the move, so the strip
     * does not jump to a different page under the parent's finger.
     */
    fun movePage(from: Int, to: Int) = change {
        val last = book.pageCount - 1
        val f = from.coerceIn(0, last)
        val t = to.coerceIn(0, last)
        if (f == t) return@change
        store.edit { current ->
            val page = current.pages[f]
            current.copy(pages = current.pages.removeAt(f).add(t, page), updatedAtEpochMs = clock())
        }
        pageIndex = when {
            pageIndex == f -> t
            f < t && pageIndex in (f + 1)..t -> pageIndex - 1
            t < f && pageIndex in t..(f - 1) -> pageIndex + 1
            else -> pageIndex
        }
        selectedId = null
        toast = TOAST_PAGE_MOVED
    }

    fun setMode(next: EditorMode) = change {
        mode = next
        if (next != EditorMode.TEXT) {
            selectedId = null
            clearDraft()
        }
    }

    fun setCategory(next: String) = change { category = next }

    fun setUiLevel(level: UiLevel) = change { uiLevel = level }

    // ── parts ────────────────────────────────────────────────────────────────

    fun addPart(partId: PartId) = addPartAt(partId, 50f, 52f, 26f)

    fun addPartAt(
        partId: PartId,
        xPct: Float,
        yPct: Float,
        sizePct: Float,
        heightPct: Float? = null,
    ) = change {
        require(xPct.isFinite() && yPct.isFinite())
        require(sizePct.isFinite() && sizePct > 0f)
        require(heightPct == null || (heightPct.isFinite() && heightPct > 0f))
        val id = nextItemId()
        store.edit { current ->
            current.mapPage(pageIndex) { p ->
                p.copy(items = p.items.add(PartItem(
                    id = id, x = xPct.coerceIn(0f, 100f), y = yPct.coerceIn(0f, 100f),
                    partId = partId, sizePct = sizePct, heightPct = heightPct,
                )))
            }.copy(updatedAtEpochMs = clock())
        }
        selectedId = id
        toast = TOAST_PART_PLACED
    }

    /** Returns the item now selected, or null if the tap landed on empty page. */
    fun selectAt(xPct: Float, yPct: Float, pageSize: Size): Item? {
        val hit = hitTest.at(page, xPct, yPct, pageSize)
        change {
            selectedId = hit?.id
            if (hit is TextItem) {
                mode = EditorMode.TEXT
                followText(hit)
            }
        }
        return hit
    }

    fun clearSelection() = change { selectedId = null }

    fun selectItem(id: ItemId) {
        require(page.items.any { it.id == id }) { "unknown item ${id.value}" }
        val item = page.items.first { it.id == id }
        change {
            selectedId = id
            if (item is TextItem) {
                mode = EditorMode.TEXT
                followText(item)
            }
        }
    }

    // ── dragging: one gesture is one undo step ───────────────────────────────

    fun beginDrag() {
        store.beginGesture()
    }

    fun dragTo(xPct: Float, yPct: Float) = change {
        require(xPct.isFinite() && yPct.isFinite())
        val id = selectedId ?: return@change
        store.update { current ->
            current.mapPage(pageIndex) { p ->
                val index = p.items.indexOfFirst { it.id == id }
                if (index < 0) p
                else p.copy(
                    items = p.items.set(
                        index,
                        p.items[index].movedTo(
                            xPct.coerceIn(EDGE_MARGIN, 100f - EDGE_MARGIN),
                            yPct.coerceIn(EDGE_MARGIN, 100f - EDGE_MARGIN),
                        ),
                    ),
                )
            }
        }
    }

    /** An absolute angle inside a [beginDrag] gesture, so a whole twist of the handle is one undo step. */
    fun rotateSelectedTo(deg: Float) = change {
        require(deg.isFinite())
        val id = selectedId ?: return@change
        val angle = deg.mod(360f)
        store.update { current ->
            current.mapPage(pageIndex) { p ->
                val index = p.items.indexOfFirst { it.id == id }
                if (index < 0) p
                else p.copy(items = p.items.set(index, when (val item = p.items[index]) {
                    is PartItem -> item.copy(rotationDeg = angle)
                    is TextItem -> item.copy(rotationDeg = angle)
                }))
            }
        }
    }

    fun endDrag() = change {
        // Inside the gesture, not after it: a separate edit would become its own history
        // entry, and the child's first undo tap would change nothing they can see.
        if (store.hasGestureChanges) store.update { it.copy(updatedAtEpochMs = clock()) }
        store.endGesture()
    }

    fun cancelDrag() = change {
        store.cancelGesture()
        strokePage = null
        strokePart = null
    }

    // ── selected-item actions ────────────────────────────────────────────────

    fun resizeSelected(bigger: Boolean) = change {
        mapSelected { item ->
            when (item) {
                is PartItem -> item.resizedBy(
                    if (bigger) PartItem.STEP_UP else PartItem.STEP_DOWN,
                )
                is TextItem -> {
                    val next = if (bigger) TextItem.SIZES.firstOrNull { it > item.sizePct } ?: (item.sizePct * 1.2f)
                    else TextItem.SIZES.lastOrNull { it < item.sizePct } ?: (item.sizePct / 1.2f)
                    applyTextSize(next)
                    item.copy(sizePct = textSizePct)
                }
            }
        }
    }

    fun rotateSelected() = change {
        mapSelected { item ->
            when (item) {
                is PartItem -> item.rotatedBy(PartItem.ROTATE_STEP)
                is TextItem -> item.copy(
                    rotationDeg = (item.rotationDeg + PartItem.ROTATE_STEP).mod(360f),
                )
            }
        }
    }

    fun deleteSelected() = change {
        val id = selectedId ?: return@change
        store.edit { current ->
            current.mapPage(pageIndex) { p ->
                p.copy(items = p.items.removeAll { it.id == id })
            }.copy(updatedAtEpochMs = clock())
        }
        selectedId = null
    }

    /** Moves the selection to another page as one undo step, keeping its id and, unless given, its position. */
    fun moveSelectedToPage(target: Int, xPct: Float? = null, yPct: Float? = null) = change {
        val item = selected ?: return@change
        check(!isGestureActive) { "finish the current gesture first" }
        require(target in book.pages.indices)
        if (target == pageIndex && xPct == null && yPct == null) return@change
        val placed = item.movedTo((xPct ?: item.x).coerceIn(0f, 100f), (yPct ?: item.y).coerceIn(0f, 100f))
        store.edit { current ->
            current.mapPage(pageIndex) { p -> p.copy(items = p.items.removeAll { it.id == item.id }) }
                .mapPage(target) { p -> p.copy(items = p.items.add(placed)) }
                .copy(updatedAtEpochMs = clock())
        }
        pageIndex = target
        selectedId = item.id
    }

    // ── clipboard ────────────────────────────────────────────────────────────

    /** The selection as clipboard text, carrying its embedded picture so another book can paste it. */
    fun copySelected(): String? {
        val item = selected ?: return null
        val art = (item as? PartItem)?.partId?.takeIf { it.category == Artwork.CATEGORY }?.let { book.art[it.name] }
        return ItemClip.encode(ItemClip(item = item, art = art))
    }

    /**
     * Places a copied item on this page as one undo step, nudged off any item already at that spot.
     * False when the text is not a clip, or its picture is missing or would overflow the book's art budget.
     */
    fun paste(clip: String): Boolean {
        if (isGestureActive || editingPartId != null) return false
        val decoded = ItemClip.decodeOrNull(clip) ?: return false
        var item = decoded.item
        var art = book.art
        if (item is PartItem && item.partId.category == Artwork.CATEGORY) {
            val picture = decoded.art ?: book.art[item.partId.name] ?: return false
            val key = artKeyFor(item.partId.name, picture) ?: return false
            if (art[key] == null) {
                if (art.values.sumOf { it.svg.length } + picture.svg.length > Artwork.MAX_TOTAL_SVG_CHARS) return false
                art = art + (key to picture)
            }
            item = item.copy(partId = Artwork.partId(key))
        }
        var x = item.x.coerceIn(0f, 100f)
        var y = item.y.coerceIn(0f, 100f)
        repeat(PASTE_NUDGES) {
            if (page.items.none { abs(it.x - x) < 0.5f && abs(it.y - y) < 0.5f }) return@repeat
            x = (x + PASTE_OFFSET).coerceAtMost(100f - EDGE_MARGIN)
            y = (y + PASTE_OFFSET).coerceAtMost(100f - EDGE_MARGIN)
        }
        val id = nextItemId()
        val pasted = when (item) {
            is PartItem -> item.copy(id = id, x = x, y = y)
            is TextItem -> item.copy(id = id, x = x, y = y)
        }
        change {
            store.edit { current ->
                current.mapPage(pageIndex) { p -> p.copy(items = p.items.add(pasted)) }
                    .copy(art = art, updatedAtEpochMs = clock())
            }
            selectedId = id
            if (pasted is TextItem) followText(pasted)
        }
        return true
    }

    /** Plain text from another app becomes words in the current text style, keeping its line breaks. */
    fun pasteText(text: String): Boolean {
        if (isGestureActive || editingPartId != null) return false
        val words = text.lines().joinToString("\n") { it.replace(Regex("\\s+"), " ").trim() }
            .trim('\n').take(MAX_PASTED_TEXT)
        if (words.isEmpty()) return false
        val id = nextItemId()
        change {
            store.edit { current ->
                current.mapPage(pageIndex) { p ->
                    p.copy(items = p.items.add(TextItem(
                        id = id, x = 50f, y = 78f, text = words, colorIndex = textColorIndex,
                        sizePct = textSizePct, font = fontFace, bold = textBold, color = customTextColor, lineHeight = textLineHeight,
                    )))
                }.copy(updatedAtEpochMs = clock())
            }
            selectedId = id
        }
        return true
    }

    /** The same name when it is free or already holds this picture, otherwise the first free `name-2`, `name-3`… */
    private fun artKeyFor(name: String, picture: Artwork): String? {
        val base = name.take(56)
        return (sequenceOf(name) + (2..99).asSequence().map { "$base-$it" })
            .firstOrNull { key -> Artwork.isKey(key) && book.art[key].let { it == null || it == picture } }
    }

    /** Moves the selection one step toward the front. Items draw in list order. */
    fun bringForward() = change {
        val id = selectedId ?: return@change
        store.edit { current ->
            current.mapPage(pageIndex) { p ->
                val i = p.indexOf(id)
                if (i < 0 || i == p.items.lastIndex) p
                else p.copy(items = p.items.removeAt(i).add(i + 1, p.items[i]))
            }.copy(updatedAtEpochMs = clock())
        }
    }

    fun sendBackward() = change {
        val id = selectedId ?: return@change
        store.edit { current ->
            current.mapPage(pageIndex) { p ->
                val i = p.indexOf(id)
                if (i <= 0) p
                else p.copy(items = p.items.removeAt(i).add(i - 1, p.items[i]))
            }.copy(updatedAtEpochMs = clock())
        }
    }

    fun setPageBackground(color: Argb) = change {
        store.edit { current ->
            current.mapPage(pageIndex) { it.copy(background = color) }
                .copy(updatedAtEpochMs = clock())
        }
    }

    // ── drawing ──────────────────────────────────────────────────────────────

    fun beginIllustrationEdit() = change {
        check(!isGestureActive) { "finish the current gesture first" }
        require(selected is PartItem) { "select an illustration first" }
        editingPartId = selectedId
    }

    fun endIllustrationEdit() = change {
        check(!isGestureActive) { "finish the current gesture first" }
        editingPartId = null
    }

    fun setCrayon(index: Int) = change {
        crayonIndex = index.coerceIn(app.ehon.design.Organic.drawingCrayons.indices)
        customInk = null
        eraser = false
    }

    fun setBrushColor(color: Argb) = change {
        customInk = color.withAlpha(1f)
        eraser = false
    }

    /** Sizes whichever of brush or eraser is active. */
    fun setBrush(step: Float) = change {
        require(step.isFinite())
        brushStep = step.coerceIn(Stroke.MIN_BRUSH_STEP, Stroke.MAX_BRUSH_STEP)
    }

    fun toggleEraser() = change { eraser = !eraser }

    /** Points are normalised 0..1 relative to the page. */
    fun beginStroke(x: Float, y: Float) {
        require(x.isFinite() && y.isFinite())
        check(!isGestureActive) { "finish the current gesture first" }
        strokePage = pageIndex
        strokePart = (selected as? PartItem)?.takeIf { it.id == editingPartId }
        store.beginGesture()
        change {
            val ink = if (eraser) Ink.Eraser else customInk?.let { Ink.Solid(it) } ?: Ink.Crayon(crayonIndex)
            updateStroke(
                pageEdit = { it.copy(strokes = it.strokes.add(Stroke(ink, brushStep, persistentListOf(StrokePoint(x, y))))) },
                partEdit = { part ->
                    val drawing = part.drawing ?: PartDrawing()
                    part.copy(drawing = drawing.copy(strokes = drawing.strokes.add(PartStroke(
                        ink, Stroke.widthFraction(brushStep) / (part.sizePct / 100f),
                        persistentListOf(partPoint(x, y)),
                    ))))
                },
            )
        }
    }

    fun appendStroke(x: Float, y: Float) = change {
        require(x.isFinite() && y.isFinite())
        updateStroke(
            pageEdit = { p ->
                val last = p.strokes.last()
                p.copy(strokes = p.strokes.set(p.strokes.lastIndex, last.copy(points = last.points.add(StrokePoint(x, y)))))
            },
            partEdit = { part ->
                val drawing = part.drawing!!
                val last = drawing.strokes.last()
                part.copy(drawing = drawing.copy(strokes = drawing.strokes.set(drawing.strokes.lastIndex,
                    last.copy(points = last.points.add(partPoint(x, y))))))
            },
        )
    }

    /** Simplifies the finished stroke — see [StrokeSimplify] on why this matters. */
    fun endStroke() = change {
        if (strokePage == null) return@change
        updateStroke(
            pageEdit = { p ->
                val last = p.strokes.last()
                p.copy(strokes = p.strokes.set(p.strokes.lastIndex,
                    last.copy(points = StrokeSimplify.simplify(last.points, StrokeSimplify.epsilonFor(Stroke.widthFraction(last.brushStep))).toPersistentList())))
            },
            partEdit = { part ->
                val drawing = part.drawing!!
                val last = drawing.strokes.last()
                part.copy(drawing = drawing.copy(strokes = drawing.strokes.set(drawing.strokes.lastIndex,
                    last.copy(points = StrokeSimplify.simplify(last.points, StrokeSimplify.epsilonFor(last.width)).toPersistentList()))))
            },
        )
        store.update { it.copy(updatedAtEpochMs = clock()) }
        store.endGesture()
        strokePage = null
        strokePart = null
    }

    private fun updateStroke(pageEdit: (Page) -> Page, partEdit: (PartItem) -> PartItem) {
        val index = strokePage ?: return
        val partId = strokePart?.id
        store.update { current ->
            current.mapPage(index) { p ->
                if (partId == null) pageEdit(p)
                else {
                    val itemIndex = p.indexOf(partId)
                    if (itemIndex < 0) p
                    else p.copy(items = p.items.set(itemIndex, partEdit(p.items[itemIndex] as PartItem)))
                }
            }
        }
    }

    /** Undo the instance rotation in physical page units before normalising to its box. */
    private fun partPoint(x: Float, y: Float): StrokePoint {
        val part = strokePart!!
        val page = Size(1f, 1f / book.shape.aspect)
        val box = part.dimensions(page)
        val dx = x - part.x / 100f
        val dy = (y - part.y / 100f) * page.h
        val angle = -part.rotationDeg * PI.toFloat() / 180f
        return StrokePoint(
            0.5f + (dx * cos(angle) - dy * sin(angle)) / box.w,
            0.5f + (dx * sin(angle) + dy * cos(angle)) / box.h,
        )
    }

    fun clearStrokes() = change {
        store.edit { current ->
            current.mapPage(pageIndex) { it.copy(strokes = persistentListOf()) }
                .copy(updatedAtEpochMs = clock())
        }
    }

    // ── text ─────────────────────────────────────────────────────────────────

    fun setDraftText(value: String) = change {
        if (isTextSelected) mapSelected { (it as TextItem).copy(text = value) }
        else draftText = value
    }

    fun setDraftRuby(value: String) = change {
        if (isTextSelected) mapSelected { (it as TextItem).copy(ruby = value.ifBlank { null }) }
        else draftRuby = value
    }

    fun setTextSize(step: Int) = setTextSizePct(TextItem.SIZES[step.coerceIn(1, TextItem.SIZES.size) - 1])

    /** Any size in percent of page width, applied to the selected text like [setTextColour]. */
    fun setTextSizePct(pct: Float) = change {
        require(pct.isFinite())
        applyTextSize(pct)
        if (isTextSelected) mapSelected { (it as TextItem).copy(sizePct = textSizePct) }
    }

    fun setLineHeight(ems: Float) = change {
        require(ems.isFinite())
        textLineHeight = ems.coerceIn(TextItem.MIN_LINE_HEIGHT, TextItem.MAX_LINE_HEIGHT)
        if (isTextSelected) mapSelected { (it as TextItem).copy(lineHeight = textLineHeight) }
    }

    fun setBold(on: Boolean) = change {
        textBold = on
        if (isTextSelected) mapSelected { (it as TextItem).copy(bold = on) }
    }

    fun toggleFurigana() = change { furiganaEnabled = !furiganaEnabled }

    /** Applies immediately to a selected text item, like [setTextColour]. */
    fun setFont(face: FontFace) = change {
        fontFace = if (face == FontFace.UI) FontFace.default else face
        if (isTextSelected) mapSelected { (it as TextItem).copy(font = fontFace) }
    }

    /** Applies immediately to a selected text item, so a colour tap is never a no-op. */
    fun setTextColour(index: Int) = change {
        textColorIndex = index.coerceIn(app.ehon.design.Organic.textColors.indices)
        customTextColor = null
        if (isTextSelected) mapSelected { (it as TextItem).copy(colorIndex = textColorIndex, color = null) }
    }

    /** Any colour for the text; the nearest preset is kept in `colorIndex` so the phone shows something close. */
    fun setCustomTextColour(color: Argb) = change {
        val opaque = color.withAlpha(1f)
        customTextColor = opaque
        textColorIndex = app.ehon.design.Organic.textColors.indices.minBy { distance(app.ehon.design.Organic.textColors[it], opaque) }
        if (isTextSelected) mapSelected { (it as TextItem).copy(colorIndex = textColorIndex, color = opaque) }
    }

    /** Commits the draft, or finishes editing an already-selected text item. */
    fun commitText(): Boolean {
        if (isTextSelected) {
            change {
                selectedId = null
                clearDraft()
                mode = EditorMode.STICK
            }
            return true
        }
        if (draftText.isBlank()) {
            change { toast = TOAST_ENTER_TEXT }
            return false
        }
        val id = nextItemId()
        change {
            store.edit { current ->
                current.mapPage(pageIndex) { p ->
                    p.copy(
                        items = p.items.add(
                            TextItem(
                                id = id,
                                x = 50f,
                                y = 78f,
                                text = draftText,
                                ruby = draftRuby.ifBlank { null }.takeIf { showFuriganaField },
                                colorIndex = textColorIndex,
                                sizePct = textSizePct,
                                font = fontFace,
                                bold = textBold,
                                color = customTextColor,
                                lineHeight = textLineHeight,
                            ),
                        ),
                    )
                }.copy(updatedAtEpochMs = clock())
            }
            selectedId = id
            clearDraft()
            mode = EditorMode.STICK
        }
        return true
    }

    // ── history ──────────────────────────────────────────────────────────────

    fun undo() = change {
        store.undo()
        clampAfterHistory()
    }

    fun redo() = change {
        store.redo()
        clampAfterHistory()
    }

    /** A revised whole document as one undo step; the page is kept by id, the selection only if its item survived. */
    fun replaceDocument(next: Book) {
        check(!store.isGestureActive) { "finish the current gesture before replacing the document" }
        require(next.id == book.id) { "a different book cannot replace the open one" }
        require(next.pages.isNotEmpty()) { "an editor needs at least one page" }
        change {
            val pageId = page.id
            store.edit { next.copy(updatedAtEpochMs = clock()) }
            pageIndex = next.pages.indexOfFirst { it.id == pageId }.takeIf { it >= 0 } ?: pageIndex.coerceIn(0, next.pageCount - 1)
            if (selected == null) selectedId = null
        }
    }

    /** The current page's item boxes in percent, for region queries such as a marked area. */
    fun itemBounds(pageSize: Size): List<ItemBounds> = hitTest.bounds(page, pageSize)

    fun consumeToast(): String? {
        val value = toast
        if (value != null) change { toast = null }
        return value
    }

    /** Stage first: a malformed batch cannot leave half an AI edit or destroy redo history. */
    fun applyBatch(intents: List<EditorIntent>) {
        require(intents.size <= 100) { "too many intents" }
        check(!store.isGestureActive) { "finish the current gesture before applying intents" }
        if (intents.isEmpty()) return
        val staged = EditorController(book, measurer, idSource, clock)
        staged.copyCompositionState(this)
        intents.forEach { staged.applyIntent(it) }
        store.beginGesture()
        store.update { staged.book }
        store.endGesture()
        copyCompositionState(staged)
        revision++
    }

    private fun applyIntent(intent: EditorIntent) {
        when (intent) {
            is EditorIntent.AddPart -> addPartAt(PartId(intent.partId), intent.xPct, intent.yPct, intent.sizePct, intent.heightPct)
            is EditorIntent.SelectItem -> selectItem(ItemId(intent.id))
            is EditorIntent.MoveSelected -> { beginDrag(); dragTo(intent.xPct, intent.yPct); endDrag() }
            is EditorIntent.ResizeSelected -> resizeSelected(intent.bigger)
            EditorIntent.RotateSelected -> rotateSelected()
            EditorIntent.DeleteSelected -> deleteSelected()
            EditorIntent.BringForward -> bringForward()
            EditorIntent.SendBackward -> sendBackward()
            EditorIntent.ClearSelection -> clearSelection()
            is EditorIntent.SetBackground -> setPageBackground(Argb(intent.argb))
            is EditorIntent.SetDraftText -> setDraftText(intent.text)
            is EditorIntent.SetDraftRuby -> setDraftRuby(intent.ruby)
            is EditorIntent.SetTextSize -> setTextSize(intent.step)
            is EditorIntent.SetFont -> setFont(FontFace.fromId(intent.id))
            is EditorIntent.SetTextColour -> setTextColour(intent.index)
            EditorIntent.CommitText -> require(commitText()) { "text is empty" }
            is EditorIntent.GoToPage -> {
                require(intent.index in book.pages.indices)
                goToPage(intent.index)
            }
            EditorIntent.AddPage -> addPage()
            is EditorIntent.MovePage -> {
                require(intent.from in book.pages.indices && intent.to in book.pages.indices)
                movePage(intent.from, intent.to)
            }
        }
    }

    private fun copyCompositionState(other: EditorController) {
        pageIndex = other.pageIndex
        selectedId = other.selectedId
        editingPartId = other.editingPartId
        mode = other.mode
        uiLevel = other.uiLevel
        textSizeStep = other.textSizeStep
        textSizePct = other.textSizePct
        textBold = other.textBold
        textLineHeight = other.textLineHeight
        customTextColor = other.customTextColor
        textColorIndex = other.textColorIndex
        fontFace = other.fontFace
        draftText = other.draftText
        draftRuby = other.draftRuby
        furiganaEnabled = other.furiganaEnabled
        toast = other.toast
    }

    // ── internals ────────────────────────────────────────────────────────────

    private fun clampAfterHistory() {
        pageIndex = pageIndex.coerceIn(0, book.pageCount - 1)
        if (selected == null) selectedId = null
    }

    private fun followText(item: TextItem) {
        fontFace = item.font
        textColorIndex = item.colorIndex.coerceIn(app.ehon.design.Organic.textColors.indices)
        customTextColor = item.color
        textBold = item.bold
        textLineHeight = item.lineHeight
        applyTextSize(item.sizePct)
    }

    /** Keeps the phone's three-step picker pointing at the nearest step to a free size. */
    private fun applyTextSize(pct: Float) {
        textSizePct = pct.coerceIn(TextItem.MIN_SIZE_PCT, TextItem.MAX_SIZE_PCT)
        textSizeStep = TextItem.SIZES.indices.minBy { kotlin.math.abs(TextItem.SIZES[it] - textSizePct) } + 1
    }

    private fun distance(a: Argb, b: Argb): Int =
        (a.r - b.r) * (a.r - b.r) + (a.g - b.g) * (a.g - b.g) + (a.b - b.b) * (a.b - b.b)

    private fun clearDraft() {
        draftText = ""
        draftRuby = ""
    }

    private fun nextItemId(): ItemId {
        val used = book.pages.flatMap { it.items }.mapTo(mutableSetOf()) { it.id }
        var id = idSource.next()
        while (id in used) id = idSource.next()
        return id
    }

    private inline fun mapSelected(crossinline transform: (Item) -> Item) {
        val id = selectedId ?: return
        store.edit { current ->
            current.mapPage(pageIndex) { p ->
                val index = p.items.indexOfFirst { it.id == id }
                if (index < 0) p else p.copy(items = p.items.set(index, transform(p.items[index])))
            }.copy(updatedAtEpochMs = clock())
        }
    }

    private inline fun change(body: () -> Unit) {
        body()
        if (selectedId != editingPartId || selected !is PartItem) editingPartId = null
        revision++
    }

    private companion object {
        /** Items cannot be dragged fully off the page. */
        const val EDGE_MARGIN = 4f

        const val TOAST_PART_PLACED = "toast.partPlaced"
        const val TOAST_PAGE_ADDED = "toast.pageAdded"
        const val TOAST_PAGE_MOVED = "toast.pageMoved"
        const val TOAST_ENTER_TEXT = "toast.enterText"

        const val PASTE_OFFSET = 3f
        const val PASTE_NUDGES = 20
        const val MAX_PASTED_TEXT = 200
    }
}
