package app.ehon.scene

import app.ehon.FakeMeasurer
import app.ehon.catalog.Part
import app.ehon.catalog.PartCatalog
import app.ehon.catalog.PartDef
import app.ehon.catalog.PartResolver
import app.ehon.design.Organic
import app.ehon.engine.HitTest
import app.ehon.geom.Size
import app.ehon.model.*
import kotlinx.collections.immutable.persistentListOf
import kotlin.test.*

class RasterSceneTest {
    private val part = PartItem(ItemId("i1"), 50f, 50f, partId = PartId("lib:scene"), sizePct = 80f, heightPct = 30f)
    private val resolver = PartResolver { id ->
        if (id == part.partId) Part(id, "scene", "lib", PartDef.Raster("a/fixture")) else PartCatalog.find(id)
    }
    private val builder = SceneBuilder(FakeMeasurer, resolver)
    private fun page(item: PartItem = part) = Page(background = Organic.surface, items = persistentListOf(item))

    @Test
    fun `non-square raster and selection resolve to the same rectangle on every page shape`() {
        PageShape.entries.forEach { shape ->
            val target = RenderTarget.screen(shape, Size(600f, 600f), part.id)
            val scene = builder.build(page(), target)
            val image = (scene.nodes.first() as SceneNode.Group).children.single() as SceneNode.Image
            val selection = scene.nodes.last() as SceneNode.SelectionRing
            assertEquals("a/fixture", image.assetName)
            assertEquals(target.page.w * 0.8f, image.rect.w, 0.001f)
            assertEquals(target.page.h * 0.3f, image.rect.h, 0.001f)
            assertEquals(image.rect, selection.rect)
            val export = builder.build(page(), RenderTarget.share(shape))
            val exportedImage = (export.nodes.single() as SceneNode.Group).children.single() as SceneNode.Image
            assertEquals(image.rect.w / scene.size.w, exportedImage.rect.w / export.size.w, 0.00001f)
            assertEquals(image.rect.h / scene.size.h, exportedImage.rect.h / export.size.h, 0.00001f)
        }
    }

    @Test
    fun `legacy null height stays physically square on a landscape page`() {
        val scene = builder.build(page(part.copy(heightPct = null)), RenderTarget.screen(PageShape.LANDSCAPE, Size(600f, 400f)))
        val image = (scene.nodes.single() as SceneNode.Group).children.single() as SceneNode.Image
        assertEquals(image.rect.w, image.rect.h)
    }

    @Test
    fun `hit testing follows a rotated non-square part`() {
        val hit = HitTest(FakeMeasurer)
        val wide = part.copy(sizePct = 80f, heightPct = 10f)
        val size = Size(600f, 400f)
        assertNotNull(hit.at(page(wide), 85f, 50f, size))
        assertNull(hit.at(page(wide), 50f, 70f, size))
        assertNotNull(hit.at(page(wide.copy(rotationDeg = 90f)), 50f, 85f, size))
        assertNull(hit.at(page(wide.copy(rotationDeg = 90f)), 85f, 50f, size))
    }

    @Test
    fun `custom resolver retains builtins and unknown references are harmless`() {
        val cat = part.copy(partId = PartId("いきもの:ねこ"))
        assertTrue(builder.build(page(cat), RenderTarget.share(PageShape.SQUARE)).nodes.isNotEmpty())
        val missing = part.copy(partId = PartId("lib:missing"))
        assertTrue(builder.build(page(missing), RenderTarget.share(PageShape.SQUARE)).nodes.isEmpty())
    }

    @Test
    fun `mixed text and part order follows the document`() {
        val text = TextItem(ItemId("t1"), 50f, 50f, text = "ねこ")
        val scene = builder.build(page().copy(items = persistentListOf(text, part)), RenderTarget.share(PageShape.SQUARE))
        assertTrue(scene.nodes.first() is SceneNode.Text)
        assertTrue(scene.nodes.last() is SceneNode.Group)
    }
}
