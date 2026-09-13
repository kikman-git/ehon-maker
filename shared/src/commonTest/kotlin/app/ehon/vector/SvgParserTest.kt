package app.ehon.vector

import app.ehon.design.Argb
import app.ehon.geom.Rect
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class SvgParserTest {
    private fun svg(body: String, viewBox: String = "0 0 100 50") =
        """<svg xmlns="http://www.w3.org/2000/svg" viewBox="$viewBox">$body</svg>"""

    @Test
    fun `basic shapes become absolute outlines with their own colours`() {
        val art = SvgParser.parse(svg("""
            <rect x="10" y="10" width="20" height="10" fill="#ff0000"/>
            <circle cx="50" cy="25" r="5" fill="rgb(0, 128, 0)" stroke="black" stroke-width="2"/>
            <line x1="0" y1="0" x2="10" y2="10" stroke="#00f"/>
            <polygon points="0,0 10,0 5,5" fill="none" stroke="rgba(255,255,255,0.5)"/>
        """))
        assertEquals(Rect(0f, 0f, 100f, 50f), art.viewBox)
        assertEquals(2f, art.aspect)
        assertEquals(4, art.layers.size)

        val rect = art.layers[0]
        assertEquals(PathCommand.MoveTo(10f, 10f), rect.commands.first())
        assertEquals(PathCommand.LineTo(30f, 10f), rect.commands[1])
        assertEquals(PathCommand.Close, rect.commands.last())
        assertTrue(rect.hasFill)
        assertEquals(Argb.hex("ff0000"), rect.fill)
        assertEquals(0f, rect.strokeWidth)

        val circle = art.layers[1]
        assertEquals(Argb.hex("008000"), circle.fill)
        assertEquals(2f, circle.strokeWidth)
        assertEquals(Argb.hex("000000"), circle.stroke)
        assertEquals(PathCommand.MoveTo(55f, 25f), circle.commands.first())
        assertEquals(4, circle.commands.count { it is PathCommand.CubicTo })

        val line = art.layers[2]
        assertFalse(line.hasFill)
        assertEquals(Argb.hex("0000ff"), line.stroke)
        assertEquals(1f, line.strokeWidth)

        val polygon = art.layers[3]
        assertFalse(polygon.hasFill)
        assertEquals(0x80, polygon.stroke.a)
        assertTrue(art.unsupported.isEmpty())
    }

    @Test
    fun `path data handles relative commands implicit repeats shorthand curves and arcs`() {
        val art = SvgParser.parse(svg("""<path d="M10 10 l 20 0 20 10 v10 h-40 z m 5 5 q 5 -5 10 0 t 10 0 a 5 5 0 0 1 10 0" fill="#000"/>"""))
        val commands = art.layers.single().commands
        assertEquals(
            listOf(
                PathCommand.MoveTo(10f, 10f), PathCommand.LineTo(30f, 10f), PathCommand.LineTo(50f, 20f),
                PathCommand.LineTo(50f, 30f), PathCommand.LineTo(10f, 30f), PathCommand.Close,
                PathCommand.MoveTo(15f, 15f), PathCommand.QuadTo(20f, 10f, 25f, 15f), PathCommand.QuadTo(30f, 20f, 35f, 15f),
            ),
            commands.take(9),
        )
        val arc = commands.drop(9)
        assertTrue(arc.isNotEmpty() && arc.all { it is PathCommand.CubicTo })
        val end = arc.last() as PathCommand.CubicTo
        assertEquals(45f, end.x, 0.01f)
        assertEquals(15f, end.y, 0.01f)
        // A half circle of radius 5 above the chord peaks 5 units above it.
        val peak = arc.first() as PathCommand.CubicTo
        assertTrue(peak.y1 < 15f)
    }

    @Test
    fun `transforms compose through groups and scale stroke widths`() {
        val art = SvgParser.parse(svg("""
            <g transform="translate(10, 20)"><g transform="scale(2)">
              <rect width="5" height="5" fill="none" stroke="#000" stroke-width="1"/>
            </g></g>
            <g transform="rotate(90 10 10)"><rect x="10" y="10" width="10" height="2" fill="#000"/></g>
        """))
        val scaled = art.layers[0]
        assertEquals(PathCommand.MoveTo(10f, 20f), scaled.commands[0])
        assertEquals(PathCommand.LineTo(20f, 20f), scaled.commands[1])
        assertEquals(2f, scaled.strokeWidth, 0.0001f)
        val rotated = art.layers[1].commands[1] as PathCommand.LineTo
        assertEquals(10f, rotated.x, 0.001f)
        assertEquals(20f, rotated.y, 0.001f)
    }

    @Test
    fun `style attributes class rules opacity and gradients resolve to flat colours`() {
        val art = SvgParser.parse(svg("""
            <defs><linearGradient id="sky"><stop offset="0" stop-color="#000000"/><stop offset="1" stop-color="#ffffff"/></linearGradient></defs>
            <style>.a { fill: #ff0000; opacity: .5 } .b{stroke:#00ff00}</style>
            <rect class="a" width="10" height="10" style="fill:#00ff00"/>
            <rect width="1" height="1" fill="url(#sky)"/>
            <g opacity="0.5"><rect width="1" height="1" fill="#ffffff" fill-opacity="0.5"/></g>
            <rect width="2" height="2" fill="rebeccapurple" fill-rule="evenodd" stroke="currentColor" stroke-linecap="round" stroke-linejoin="bevel"/>
        """))
        assertEquals(Argb.hex("00ff00").withAlpha(0.5f), art.layers[0].fill)
        assertEquals(Argb.hex("808080"), art.layers[1].fill)
        assertEquals(64, art.layers[2].fill.a)
        val named = art.layers[3]
        assertEquals(Argb.hex("663399"), named.fill)
        assertTrue(named.evenOdd)
        assertEquals(LineCap.ROUND, named.lineCap)
        assertEquals(LineJoin.BEVEL, named.lineJoin)
        assertEquals(app.ehon.design.Organic.ink, named.stroke)
    }

    @Test
    fun `unsupported content is skipped and named`() {
        val art = SvgParser.parse(svg("""
            <text x="1" y="1">no</text>
            <image href="x.png" width="1" height="1"/>
            <rect width="1" height="1" fill="url(#missing)"/>
            <rect width="1" height="1" fill="#123" display="none"/>
            <rect width="1" height="1" fill="#123456"/>
        """))
        assertEquals(1, art.layers.size)
        assertEquals(Argb.hex("123456"), art.layers.single().fill)
        assertEquals(listOf("<text>", "<image>", "fill:url(#missing)"), art.unsupported)
    }

    @Test
    fun `malformed markup and non svg roots are refused`() {
        assertFailsWith<IllegalArgumentException> { SvgParser.parse("""<svg viewBox="0 0 1 1"><rect width="1" height="1"/>""") }
        assertFailsWith<IllegalArgumentException> { SvgParser.parse("""<svg viewBox="0 0 1 1"><rect width=1 height="1"/></svg>""") }
        assertFailsWith<IllegalArgumentException> { SvgParser.parse("""<div viewBox="0 0 1 1"></div>""") }
        assertFailsWith<IllegalArgumentException> { SvgParser.parse("not markup") }
        assertFailsWith<IllegalArgumentException> { SvgParser.parse("""<svg viewBox="0 0 1 1"><path d="M 1 1 L" fill="#000"/></svg>""") }
    }

    @Test
    fun `comments declarations entities and a missing viewBox are tolerated`() {
        val art = SvgParser.parse("""<?xml version="1.0"?><!DOCTYPE svg><!-- hi --><svg width="200px" height="100px">
            <g><rect width="10" height="10" fill="#abc"/><!-- inside --></g><title>&amp;&#x2603;</title></svg>""")
        assertEquals(Rect(0f, 0f, 200f, 100f), art.viewBox)
        assertEquals(Argb.hex("aabbcc"), art.layers.single().fill)
        assertTrue(art.unsupported.isEmpty())
    }

    @Test
    fun `parsing is cached by source text`() {
        val text = svg("""<rect width="1" height="1" fill="#000"/>""")
        assertTrue(SvgParser.cached(text) === SvgParser.cached(text))
    }
}
