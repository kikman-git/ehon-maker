package app.ehon.engine

import app.ehon.geom.Size
import app.ehon.model.Item
import app.ehon.model.Page
import app.ehon.model.PartItem
import app.ehon.model.TextItem
import app.ehon.scene.TextBlock
import app.ehon.scene.TextMeasurer
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.PI

/**
 * Which item a tap lands on. Front-most wins, so later-placed items sit on top.
 *
 * Inputs and outputs are in percent-of-page, matching the document model, so hit
 * testing is identical on both platforms and at any page size.
 */
class HitTest(private val measurer: TextMeasurer) {

    fun at(page: Page, xPct: Float, yPct: Float, pageSize: Size): Item? {
        for (i in page.items.indices.reversed()) {
            val item = page.items[i]
            val (halfXPct, halfYPct) = halfExtentsPct(item, pageSize)
            val angle = -item.rotationDeg * PI.toFloat() / 180f
            val dx = (xPct - item.x) * pageSize.w / 100f
            val dy = (yPct - item.y) * pageSize.h / 100f
            val localX = (dx * cos(angle) - dy * sin(angle)) / pageSize.w * 100f
            val localY = (dx * sin(angle) + dy * cos(angle)) / pageSize.h * 100f
            if (abs(localX) < halfXPct + TOUCH_SLOP_PCT &&
                abs(localY) < halfYPct + TOUCH_SLOP_PCT
            ) {
                return item
            }
        }
        return null
    }

    /** Every item's unrotated box in percent of the page, back to front, for region queries. */
    fun bounds(page: Page, pageSize: Size): List<ItemBounds> = page.items.map { item ->
        val (halfX, halfY) = halfExtentsPct(item, pageSize)
        ItemBounds(item, halfX * 2f, halfY * 2f)
    }

    private fun halfExtentsPct(item: Item, pageSize: Size): Pair<Float, Float> {
        val (wPx, hPx) = when (item) {
            is PartItem -> {
                val size = item.dimensions(pageSize)
                size.w to size.h
            }
            is TextItem -> {
                val fontPx = item.sizePct / 100f * pageSize.w * TextItem.OPTICAL_SCALE
                // Measured rather than estimated from character count: the prototype's
                // `text.length * size * 1.05` is badly wrong for mixed kana and Latin.
                val block = TextBlock.size(item, fontPx, measurer)
                block.w to block.h + fontPx * TEXT_PAD_EM
            }
        }
        return (wPx / 2f / pageSize.w * 100f) to (hPx / 2f / pageSize.h * 100f)
    }

    private companion object {
        /** Generous by design: this is a four-year-old's fingertip. */
        const val TOUCH_SLOP_PCT = 1.5f

        const val TEXT_PAD_EM = 0.1f
    }
}

/** An item's centre is its own `x`/`y`; [w] and [h] are its unrotated extent in percent of the page. */
data class ItemBounds(val item: Item, val w: Float, val h: Float)
