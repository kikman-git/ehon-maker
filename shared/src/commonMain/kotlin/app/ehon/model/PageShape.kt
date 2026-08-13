package app.ehon.model

import app.ehon.geom.Size
import app.ehon.geom.fitAspect
import kotlinx.serialization.Serializable

/**
 * A book's page proportions, fixed at creation.
 *
 * Immutable by design: items are stored as percent-of-page and a part's size is
 * `s/100 * pageWidth`, so re-shaping an existing book would resize every part and
 * shift every vertical gap. The composition a child arranged would be rearranged
 * by a settings toggle, so there is no setter for this.
 */
@Serializable
enum class PageShape(val aspect: Float) {
    SQUARE(1f),
    LANDSCAPE(3f / 2f),
    PORTRAIT(3f / 4f);

    fun fitInto(box: Size): Size = fitAspect(aspect, box)

    /** Printed page size in millimetres, fitted to one A5 leaf of a folded A4 sheet. */
    fun printSizeMm(): Size = fitAspect(aspect, PRINT_LEAF_MM)

    companion object {
        /**
         * A4 landscape (297x210mm) folded down the middle yields two A5 portrait
         * leaves of 148.5x210mm. With 9mm margins the printable area of one leaf is
         * 130.5x192mm. Every shape folds through this same box, which is why there
         * is one print layout rather than three.
         */
        val PRINT_LEAF_MM = Size(130.5f, 192f)
    }
}

/** Which edge the pages are bound on. Horizontal-hiragana ehon are left-bound. */
@Serializable
enum class PageBinding { LEFT, RIGHT }
