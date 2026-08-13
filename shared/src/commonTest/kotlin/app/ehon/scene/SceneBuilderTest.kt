package app.ehon.scene

import app.ehon.FakeMeasurer
import app.ehon.design.Argb
import app.ehon.geom.Size
import app.ehon.model.Ink
import app.ehon.model.ItemId
import app.ehon.model.Page
import app.ehon.model.PageShape
import app.ehon.model.PartId
import app.ehon.model.PartItem
import app.ehon.model.Stroke
import app.ehon.model.StrokePoint
import app.ehon.model.TextItem
import kotlinx.collections.immutable.persistentListOf
import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class SceneBuilderTest {

    private val builder = SceneBuilder(FakeMeasurer)
    private val cream = Argb.hex("f9f4ed")

    private fun page(
        items: List<app.ehon.model.Item> = emptyList(),
        strokes: List<Stroke> = emptyList(),
    ) = Page(
        background = cream,
        promptKey = "tpl.forest.p1",
        items = persistentListOf(*items.toTypedArray()),
        strokes = persistentListOf(*strokes.toTypedArray()),
    )

    private val cat = PartItem(
        id = ItemId("i1"),
        x = 50f,
        y = 50f,
        partId = PartId("いきもの:ねこ"),
        sizePct = 40f,
    )

    // ── ruby, i.e. decision #9 ───────────────────────────────────────────────

    @Test
    fun `group ruby is centred on its base text`() {
        val text = TextItem(
            id = ItemId("t1"),
            x = 50f,
            y = 60f,
            text = "やま",
            ruby = "やま",
            sizePct = TextItem.SIZES[1],
        )
        val scene = builder.build(page(listOf(text)), screenTarget())
        val node = scene.nodes.filterIsInstance<SceneNode.Text>().single()

        assertNotNull(node.rubyOrigin)
        assertEquals(node.baseSizePx * TextItem.RUBY_SCALE, node.rubySizePx)

        // base is 2 full-width glyphs at 1.0em; ruby is 2 at 0.5em, so exactly half the
        // width. Centring must therefore inset the ruby by a quarter of the base width.
        val baseWidth = 2f * node.baseSizePx
        val rubyWidth = 2f * node.rubySizePx
        assertClose((baseWidth - rubyWidth) / 2f, node.rubyOrigin!!.x - node.baseOrigin.x)
    }

    @Test
    fun `ruby sits above the base line, not on it`() {
        val text = TextItem(ItemId("t1"), 50f, 50f, text = "山", ruby = "やま")
        val node = builder.build(page(listOf(text)), screenTarget())
            .nodes.filterIsInstance<SceneNode.Text>().single()
        assertTrue(node.rubyOrigin!!.y < node.baseOrigin.y)
    }

    @Test
    fun `text without a reading emits no ruby`() {
        val text = TextItem(ItemId("t1"), 50f, 50f, text = "ねこ", ruby = null)
        val node = builder.build(page(listOf(text)), screenTarget())
            .nodes.filterIsInstance<SceneNode.Text>().single()
        assertNull(node.rubyOrigin)
        assertEquals(0f, node.rubySizePx)
    }

    @Test
    fun `blank reading is treated as absent`() {
        val text = TextItem(ItemId("t1"), 50f, 50f, text = "ねこ", ruby = "   ")
        val node = builder.build(page(listOf(text)), screenTarget())
            .nodes.filterIsInstance<SceneNode.Text>().single()
        assertNull(node.rubyOrigin)
    }

    // ── resolution independence, i.e. decisions #1 and #4 ────────────────────

    @Test
    fun `stroke width scales with the page instead of staying a fixed pixel count`() {
        val stroke = Stroke(
            ink = Ink.Crayon(1),
            brushStep = 2,
            points = persistentListOf(StrokePoint(0.1f, 0.1f), StrokePoint(0.9f, 0.9f)),
        )
        val onScreen = builder.build(page(strokes = listOf(stroke)), screenTarget())
        val inPrint = builder.build(page(strokes = listOf(stroke)), printTarget())

        val screenWidth = onScreen.nodes.filterIsInstance<SceneNode.StrokePath>().single().widthPx
        val printWidth = inPrint.nodes.filterIsInstance<SceneNode.StrokePath>().single().widthPx

        // A crayon line must stay a crayon line on paper. Carried over from the
        // prototype literally it would have printed as a hairline.
        assertClose(inPrint.size.w / onScreen.size.w, printWidth / screenWidth)
        assertTrue(printWidth > screenWidth * 4f, "print stroke was only ${printWidth}px")
    }

    @Test
    fun `part geometry is identical in proportion across every target`() {
        val screen = builder.build(page(listOf(cat)), screenTarget())
        val print = builder.build(page(listOf(cat)), printTarget())

        val screenGroup = screen.nodes.filterIsInstance<SceneNode.Group>().single()
        val printGroup = print.nodes.filterIsInstance<SceneNode.Group>().single()

        assertEquals(screenGroup.children.size, printGroup.children.size)
        assertClose(screenGroup.pivot.x / screen.size.w, printGroup.pivot.x / print.size.w)
        assertClose(screenGroup.pivot.y / screen.size.h, printGroup.pivot.y / print.size.h)
    }

    @Test
    fun `the cat renders all five of its layers`() {
        val group = builder.build(page(listOf(cat)), screenTarget())
            .nodes.filterIsInstance<SceneNode.Group>().single()
        assertEquals(5, group.children.size)
    }

    @Test
    fun `strokes paint above parts so a child can draw over them`() {
        val stroke = Stroke(Ink.Crayon(0), 1, persistentListOf(StrokePoint(0.5f, 0.5f)))
        val scene = builder.build(page(listOf(cat), listOf(stroke)), screenTarget())
        val partIndex = scene.nodes.indexOfFirst { it is SceneNode.Group }
        val strokeIndex = scene.nodes.indexOfFirst { it is SceneNode.StrokePath }
        assertTrue(strokeIndex > partIndex)
    }

    @Test
    fun `eraser strokes carry no fill`() {
        val stroke = Stroke(Ink.Eraser, 2, persistentListOf(StrokePoint(0.2f, 0.2f)))
        val node = builder.build(page(strokes = listOf(stroke)), screenTarget())
            .nodes.filterIsInstance<SceneNode.StrokePath>().single()
        assertTrue(node.isEraser)
        assertNull(node.fill)
    }

    // ── export vs screen chrome ──────────────────────────────────────────────

    @Test
    fun `the watermark is a scene node, and only on a paid-gate export`() {
        assertTrue(watermarks(printTarget(watermark = true)).isNotEmpty())
        assertTrue(watermarks(printTarget(watermark = false)).isEmpty())
        // Never on screen, even if the flag is somehow set.
        assertTrue(watermarks(screenTarget().copy(watermark = true)).isEmpty())
    }

    @Test
    fun `the selection ring never reaches an export`() {
        val selected = screenTarget().copy(selectedItem = cat.id)
        val onScreen = builder.build(page(listOf(cat)), selected)
        assertEquals(1, onScreen.nodes.filterIsInstance<SceneNode.SelectionRing>().size)

        val exported = builder.build(page(listOf(cat)), printTarget().copy(selectedItem = cat.id))
        assertTrue(exported.nodes.filterIsInstance<SceneNode.SelectionRing>().isEmpty())
    }

    @Test
    fun `the prompt hint shows on an untouched page and never in an export`() {
        val hint = "だれが でてくる？"
        assertTrue(
            builder.build(page(), screenTarget(), hint)
                .nodes.filterIsInstance<SceneNode.Text>().any { it.base == hint },
        )
        assertTrue(
            builder.build(page(), printTarget(), hint)
                .nodes.filterIsInstance<SceneNode.Text>().none { it.base == hint },
        )
        assertTrue(
            builder.build(page(listOf(cat)), screenTarget(), hint)
                .nodes.filterIsInstance<SceneNode.Text>().none { it.base == hint },
        )
    }

    @Test
    fun `exports have square corners, the screen page is rounded`() {
        assertEquals(0f, builder.build(page(), printTarget()).cornerRadius)
        assertEquals(
            RenderTarget.SCREEN_CORNER_RADIUS,
            builder.build(page(), screenTarget()).cornerRadius,
        )
    }

    private fun watermarks(target: RenderTarget) =
        builder.build(page(listOf(cat)), target)
            .nodes.filterIsInstance<SceneNode.Text>()
            .filter { it.font == FontRole.UI }

    private fun screenTarget() =
        RenderTarget.screen(PageShape.SQUARE, Size(370f, 332f))

    private fun printTarget(watermark: Boolean = false) =
        RenderTarget.print(PageShape.SQUARE, dpi = 300, watermark = watermark)

    private fun assertClose(expected: Float, actual: Float, tolerance: Float = 0.01f) =
        assertTrue(abs(expected - actual) < tolerance, "expected ~$expected but was $actual")
}
