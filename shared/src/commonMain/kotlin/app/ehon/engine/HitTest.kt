package app.ehon.engine

import app.ehon.geom.Size
import app.ehon.model.Item
import app.ehon.model.Page
import app.ehon.model.PartItem
import app.ehon.model.TextItem
import app.ehon.scene.TextMeasurer
import kotlin.math.abs

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
            if (abs(xPct - item.x) < halfXPct + TOUCH_SLOP_PCT &&
                abs(yPct - item.y) < halfYPct + TOUCH_SLOP_PCT
            ) {
                return item
            }
        }
        return null
    }

    private fun halfExtentsPct(item: Item, pageSize: Size): Pair<Float, Float> {
        val (wPx, hPx) = when (item) {
            is PartItem -> {
                val side = item.sizePct / 100f * pageSize.w
                side to side
            }
            is TextItem -> {
                val fontPx = item.sizePct / 100f * pageSize.w * TextItem.OPTICAL_SCALE
                // Measured rather than estimated from character count: the prototype's
                // `text.length * size * 1.05` is badly wrong for mixed kana and Latin.
                measurer.width(item.text, fontPx, item.font) to fontPx * TEXT_HEIGHT_FACTOR
            }
        }
        return (wPx / 2f / pageSize.w * 100f) to (hPx / 2f / pageSize.h * 100f)
    }

    private companion object {
        /** Generous by design: this is a four-year-old's fingertip. */
        const val TOUCH_SLOP_PCT = 1.5f

        /** Base line-height plus room for a ruby line above. */
        const val TEXT_HEIGHT_FACTOR = 1.6f
    }
}
