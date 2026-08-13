package app.ehon

import app.ehon.scene.FontRole
import app.ehon.scene.TextMeasurer

/**
 * Deterministic stand-in for platform text metrics.
 *
 * CJK and kana are treated as full-width (1.0em), everything else as half-width
 * (0.5em) — close enough to real Japanese metrics to be meaningful, and exact enough
 * that layout arithmetic can be asserted rather than eyeballed.
 */
object FakeMeasurer : TextMeasurer {
    override fun width(text: String, fontSizePx: Float, font: FontRole): Float =
        text.fold(0) { acc, ch -> acc + if (ch.isFullWidth()) 2 else 1 } / 2f * fontSizePx

    private fun Char.isFullWidth(): Boolean = code.let { c ->
        c in 0x3040..0x30FF || // kana
            c in 0x3400..0x4DBF || // CJK ext A
            c in 0x4E00..0x9FFF || // CJK unified
            c in 0xFF00..0xFFEF // fullwidth forms
    }
}
