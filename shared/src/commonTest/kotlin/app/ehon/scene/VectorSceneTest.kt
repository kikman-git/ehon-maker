package app.ehon.scene

import app.ehon.FakeMeasurer
import app.ehon.design.Argb
import app.ehon.design.Organic
import app.ehon.geom.Size
import app.ehon.model.Artwork
import app.ehon.model.ItemId
import app.ehon.model.Page
import app.ehon.model.PageShape
import app.ehon.model.PartId
import app.ehon.model.PartItem
import app.ehon.vector.PathCommand
import kotlinx.collections.immutable.persistentListOf
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class VectorSceneTest {
    private val art = mapOf(
        "box" to Artwork("""<svg viewBox="0 0 100 50"><rect width="100" height="50" fill="#123456" stroke="#000" stroke-width="2"/></svg>""", "はこ"),
    )
    private val builder = SceneBuilder(FakeMeasurer)

    private fun page(vararg items: PartItem) = Page(background = Organic.surface, items = persistentListOf(*items))

    @Test
    fun `embedded art maps its viewBox onto the part box on every page shape`() {
        val item = PartItem(ItemId("i1"), 50f, 50f, partId = Artwork.partId("box"), sizePct = 50f, heightPct = 25f)
        val scene = builder.build(page(item), RenderTarget.share(PageShape.SQUARE, 400f), null, art)
        val group = scene.nodes.single() as SceneNode.Group
        val path = group.children.single() as SceneNode.Path
        assertEquals(PathCommand.MoveTo(100f, 150f), path.commands[0])
        assertEquals(PathCommand.LineTo(300f, 150f), path.commands[1])
        assertEquals(PathCommand.LineTo(300f, 250f), path.commands[2])
        assertTrue(path.hasFill)
        assertEquals(Argb.hex("123456"), path.fill)
        assertEquals(4f, path.strokeWidthPx, 0.001f)

        val wide = builder.build(page(item), RenderTarget.screen(PageShape.LANDSCAPE, Size(600f, 400f)), null, art)
        val widePath = (wide.nodes.single() as SceneNode.Group).children.single() as SceneNode.Path
        assertEquals(PathCommand.MoveTo(150f, 150f), widePath.commands[0])
        assertEquals(PathCommand.LineTo(450f, 150f), widePath.commands[1])
    }

    @Test
    fun `rotation nests the outline in a group around the item centre`() {
        val item = PartItem(ItemId("i1"), 50f, 50f, rotationDeg = 90f, partId = Artwork.partId("box"), sizePct = 50f)
        val group = builder.build(page(item), RenderTarget.share(PageShape.SQUARE, 400f), null, art).nodes.single() as SceneNode.Group
        assertEquals(90f, group.rotationDeg)
        assertEquals(200f, group.pivot.x)
        assertEquals(200f, group.pivot.y)
    }

    @Test
    fun `art the book does not carry paints nothing while catalog parts still resolve`() {
        val missing = PartItem(ItemId("i1"), 50f, 50f, partId = Artwork.partId("ghost"))
        val cat = PartItem(ItemId("i2"), 50f, 50f, partId = PartId("いきもの:ねこ"))
        val scene = builder.build(page(missing, cat), RenderTarget.share(PageShape.SQUARE), null, art)
        assertEquals(1, scene.nodes.size)
        assertTrue((scene.nodes.single() as SceneNode.Group).children.isNotEmpty())
        assertTrue(builder.build(page(missing), RenderTarget.share(PageShape.SQUARE)).nodes.isEmpty())
    }
}
