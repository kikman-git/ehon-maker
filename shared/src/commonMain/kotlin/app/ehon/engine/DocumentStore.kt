package app.ehon.engine

import app.ehon.model.Book

/**
 * Holds the current [Book] and its undo history.
 *
 * Undo covers *every* mutation, not just drawing. The prototype's `undo()` popped the
 * last stroke and nothing else, so placing a part, dragging it, and mis-tapping けす
 * lost it permanently — the single most likely one-star review in a children's app.
 * Snapshotting an immutable document makes undo uniform and removes the whole class of
 * "someone added a feature and forgot to write its inverse" bug.
 *
 * Snapshots are cheap because [Book] uses persistent collections: editing one item
 * copies one list spine, not the page and not its strokes.
 */
class DocumentStore(initial: Book, private val capacity: Int = DEFAULT_CAPACITY) {

    var current: Book = initial
        private set

    private val past = ArrayDeque<Book>()
    private val future = ArrayDeque<Book>()
    private var gestureBaseline: Book? = null

    val canUndo get() = past.isNotEmpty()
    val canRedo get() = future.isNotEmpty()

    /** A discrete edit: one undo step. */
    fun edit(transform: (Book) -> Book) {
        val next = transform(current)
        if (next == current) return
        push(current)
        current = next
    }

    /**
     * Start a continuous gesture — a drag, a pinch, a stroke in progress.
     *
     * Call [update] freely while it runs and [endGesture] when the finger lifts. One
     * gesture becomes one undo step, so a drag across the page doesn't bury the child's
     * previous action under sixty frames of history.
     */
    fun beginGesture() {
        if (gestureBaseline == null) gestureBaseline = current
    }

    fun update(transform: (Book) -> Book) {
        current = transform(current)
    }

    fun endGesture() {
        val baseline = gestureBaseline ?: return
        gestureBaseline = null
        if (baseline != current) push(baseline)
    }

    /** Abandon an in-flight gesture and restore the pre-gesture state. */
    fun cancelGesture() {
        gestureBaseline?.let { current = it }
        gestureBaseline = null
    }

    fun undo(): Boolean {
        val previous = past.removeLastOrNull() ?: return false
        future.addLast(current)
        current = previous
        return true
    }

    fun redo(): Boolean {
        val next = future.removeLastOrNull() ?: return false
        past.addLast(current)
        current = next
        return true
    }

    private fun push(snapshot: Book) {
        past.addLast(snapshot)
        if (past.size > capacity) past.removeFirst()
        future.clear()
    }

    companion object {
        const val DEFAULT_CAPACITY = 50
    }
}
