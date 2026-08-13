package app.ehon.scene

import app.ehon.geom.Size
import app.ehon.model.ItemId
import app.ehon.model.PageShape

/**
 * Where a scene is going, and the page box it resolves to.
 *
 * The same [SceneBuilder] serves all three, which is why an exported page cannot
 * drift from the one the child saw: they are the same tree at different scales.
 */
data class RenderTarget(
    val page: Size,
    val kind: Kind,
    /** Decision #11: the paywall is this one boolean, consumed in one place. */
    val watermark: Boolean = false,
    val selectedItem: ItemId? = null,
) {
    enum class Kind { SCREEN, SHARE, PRINT }

    val isExport get() = kind != Kind.SCREEN

    companion object {
        private const val MM_PER_INCH = 25.4f

        /** Corner radius of the page card on screen, from the prototype's `radius:16px`. */
        const val SCREEN_CORNER_RADIUS = 16f

        /**
         * Fits the page into whatever space the layout has. Decision #5: derived,
         * never a constant, so the tablet layout is a pass and not a rewrite.
         */
        fun screen(shape: PageShape, available: Size, selectedItem: ItemId? = null) =
            RenderTarget(
                page = shape.fitInto(available),
                kind = Kind.SCREEN,
                selectedItem = selectedItem,
            )

        /** 2048px on the longest edge, for LINE / Instagram / Photos. */
        fun share(shape: PageShape, longestEdgePx: Float = 2048f, watermark: Boolean = false):
            RenderTarget {
            val box = Size(longestEdgePx, longestEdgePx)
            return RenderTarget(shape.fitInto(box), Kind.SHARE, watermark)
        }

        /**
         * True print resolution. The page is sized in millimetres by [PageShape] and
         * converted to dots here, so 300dpi is a parameter rather than an assumption.
         */
        fun print(shape: PageShape, dpi: Int = 300, watermark: Boolean = false): RenderTarget {
            val mm = shape.printSizeMm()
            val k = dpi / MM_PER_INCH
            return RenderTarget(Size(mm.w * k, mm.h * k), Kind.PRINT, watermark)
        }
    }
}
