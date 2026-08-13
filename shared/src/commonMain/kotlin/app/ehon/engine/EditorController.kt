package app.ehon.engine

import app.ehon.design.Argb
import app.ehon.geom.Size
import app.ehon.model.Book
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

    var revision: Int = 0
        private set

    val book: Book get() = store.current
    val canUndo: Boolean get() = store.canUndo
    val canRedo: Boolean get() = store.canRedo

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

    /** Furigana is a Japanese-only concept, so the field only exists for a Japanese book. */
    val showFuriganaField: Boolean get() = book.isJapanese && furiganaEnabled

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

    fun setMode(next: EditorMode) = change {
        mode = next
        selectedId = null
        if (next != EditorMode.TEXT) clearDraft()
    }

    fun setCategory(next: String) = change { category = next }

    // ── parts ────────────────────────────────────────────────────────────────

    fun addPart(partId: PartId) = change {
        val id = idSource.next()
        store.edit { current ->
            current.mapPage(pageIndex) { p ->
                p.copy(items = p.items.add(PartItem(id = id, x = 50f, y = 52f, partId = partId)))
            }.copy(updatedAtEpochMs = clock())
        }
        selectedId = id
        toast = TOAST_PART_PLACED
    }

    /** Returns the item now selected, or null if the tap landed on empty page. */
    fun selectAt(xPct: Float, yPct: Float, pageSize: Size): Item? {
        val hit = hitTest.at(page, xPct, yPct, pageSize)
        change { selectedId = hit?.id }
        return hit
    }

    fun clearSelection() = change { selectedId = null }

    // ── dragging: one gesture is one undo step ───────────────────────────────

    fun beginDrag() {
        store.beginGesture()
    }

    fun dragTo(xPct: Float, yPct: Float) = change {
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
        store.update { it.copy(updatedAtEpochMs = clock()) }
        store.endGesture()
    }

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

    fun setPageBackground(color: Argb) = change {
        store.edit { current ->
            current.mapPage(pageIndex) { it.copy(background = color) }
                .copy(updatedAtEpochMs = clock())
        }
    }

    // ── drawing ──────────────────────────────────────────────────────────────

    fun setCrayon(index: Int) = change {
        crayonIndex = index
        eraser = false
        // Recolouring a selected text item is the same gesture as picking a crayon.
        if (isTextSelected) mapSelected { (it as TextItem).copy(colorIndex = index) }
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
        val id = idSource.next()
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
                                ruby = draftRuby.ifBlank { null }.takeIf { book.isJapanese },
                                // The cream crayon is invisible on a light page.
                                colorIndex = if (crayonIndex == app.ehon.design.Organic.CREAM_CRAYON) 0
                                else crayonIndex.coerceIn(app.ehon.design.Organic.textColors.indices),
                                sizePct = TextItem.SIZES[textSizeStep - 1],
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

    // ── internals ────────────────────────────────────────────────────────────

    private fun clampAfterHistory() {
        pageIndex = pageIndex.coerceIn(0, book.pageCount - 1)
        if (selected == null) selectedId = null
    }

    private fun clearDraft() {
        draftText = ""
        draftRuby = ""
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
        const val TOAST_ENTER_TEXT = "toast.enterText"
    }
}
