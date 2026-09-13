package app.ehon.engine

import app.ehon.design.Argb
import app.ehon.geom.Size
import app.ehon.model.Book
import app.ehon.model.FontFace
import app.ehon.model.Ink
import app.ehon.model.Item
import app.ehon.model.ItemId
import app.ehon.model.Page
import app.ehon.model.PartId
import app.ehon.model.PartItem
import app.ehon.model.Stroke
import app.ehon.model.StrokePoint
import app.ehon.model.TextItem
import app.ehon.scene.TextMeasurer
import app.ehon.template.IdSource
import kotlinx.collections.immutable.persistentListOf
import kotlinx.collections.immutable.toPersistentList

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

    var mode: EditorMode = EditorMode.STICK
        private set

    var category: String = app.ehon.catalog.PartCatalog.categories.first()
        private set

    var crayonIndex: Int = 1
        private set

    var brushStep: Int = 2
        private set

    var eraser: Boolean = false
        private set

    /** 1..3, indexing [TextItem.SIZES]. */
    var textSizeStep: Int = 2
        private set

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
                textColorIndex = hit.colorIndex.coerceIn(app.ehon.design.Organic.textColors.indices)
                textSizeStep = (TextItem.SIZES.indexOfFirst { it == hit.sizePct } + 1)
                    .coerceIn(1, TextItem.SIZES.size)
                fontFace = hit.font
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
                fontFace = item.font
                textColorIndex = item.colorIndex
                textSizeStep = (TextItem.SIZES.indexOf(item.sizePct) + 1).coerceIn(1, TextItem.SIZES.size)
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

    fun endDrag() = change {
        // Inside the gesture, not after it: a separate edit would become its own history
        // entry, and the child's first undo tap would change nothing they can see.
        if (store.hasGestureChanges) store.update { it.copy(updatedAtEpochMs = clock()) }
        store.endGesture()
    }

    fun cancelDrag() = change { store.cancelGesture() }

    // ── selected-item actions ────────────────────────────────────────────────

    fun resizeSelected(bigger: Boolean) = change {
        mapSelected { item ->
            when (item) {
                is PartItem -> item.resizedBy(
                    if (bigger) PartItem.STEP_UP else PartItem.STEP_DOWN,
                )
                is TextItem -> {
                    val next = (textSizeStep + if (bigger) 1 else -1).coerceIn(1, TextItem.SIZES.size)
                    textSizeStep = next
                    item.copy(sizePct = TextItem.SIZES[next - 1])
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

    fun setCrayon(index: Int) = change {
        crayonIndex = index.coerceIn(app.ehon.design.Organic.drawingCrayons.indices)
        eraser = false
    }

    fun setBrush(step: Int) = change {
        brushStep = step.coerceIn(1, 3)
        eraser = false
    }

    fun toggleEraser() = change { eraser = !eraser }

    /** Points are normalised 0..1 relative to the page. */
    fun beginStroke(x: Float, y: Float) {
        store.beginGesture()
        change {
            store.update { current ->
                current.mapPage(pageIndex) { p ->
                    p.copy(
                        strokes = p.strokes.add(
                            Stroke(
                                ink = if (eraser) Ink.Eraser else Ink.Crayon(crayonIndex),
                                brushStep = brushStep,
                                points = persistentListOf(StrokePoint(x, y)),
                            ),
                        ),
                    )
                }
            }
        }
    }

    fun appendStroke(x: Float, y: Float) = change {
        store.update { current ->
            current.mapPage(pageIndex) { p ->
                if (p.strokes.isEmpty()) p
                else {
                    val last = p.strokes.last()
                    p.copy(
                        strokes = p.strokes.set(
                            p.strokes.lastIndex,
                            last.copy(points = last.points.add(StrokePoint(x, y))),
                        ),
                    )
                }
            }
        }
    }

    /** Simplifies the finished stroke — see [StrokeSimplify] on why this matters. */
    fun endStroke() = change {
        store.update { current ->
            current.mapPage(pageIndex) { p ->
                if (p.strokes.isEmpty()) p
                else {
                    val last = p.strokes.last()
                    p.copy(
                        strokes = p.strokes.set(
                            p.strokes.lastIndex,
                            last.copy(
                                points = StrokeSimplify.simplify(last.points).toPersistentList(),
                            ),
                        ),
                    )
                }
            }
        }
        store.update { it.copy(updatedAtEpochMs = clock()) }
        store.endGesture()
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

    fun setTextSize(step: Int) = change {
        textSizeStep = step.coerceIn(1, TextItem.SIZES.size)
        if (isTextSelected) {
            mapSelected { (it as TextItem).copy(sizePct = TextItem.SIZES[textSizeStep - 1]) }
        }
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
        if (isTextSelected) mapSelected { (it as TextItem).copy(colorIndex = textColorIndex) }
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
                                sizePct = TextItem.SIZES[textSizeStep - 1],
                                font = fontFace,
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
        mode = other.mode
        uiLevel = other.uiLevel
        textSizeStep = other.textSizeStep
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
        revision++
    }

    private companion object {
        /** Items cannot be dragged fully off the page. */
        const val EDGE_MARGIN = 4f

        const val TOAST_PART_PLACED = "toast.partPlaced"
        const val TOAST_PAGE_ADDED = "toast.pageAdded"
        const val TOAST_PAGE_MOVED = "toast.pageMoved"
        const val TOAST_ENTER_TEXT = "toast.enterText"
    }
}
