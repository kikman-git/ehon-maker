package app.ehon.catalog

import app.ehon.model.PartId
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class PartCatalogTest {
    @Test
    fun `all ten categories contain raster illustrations`() {
        assertEquals(10, PartCatalog.categories.size)
        PartCatalog.categories.forEach { assertTrue(PartCatalog.inCategory(it).isNotEmpty(), it) }
        assertTrue(PartCatalog.all.all { it.def is PartDef.Raster })
        assertEquals(PartCatalog.all.size, PartCatalog.all.map { it.id }.toSet().size)
    }

    @Test
    fun `starter animals migrate to the new paintings`() {
        val names = listOf("ことり", "ちょうちょ", "さかな", "かめ", "たこ", "くじら", "ペンギン", "かに", "てんとうむし", "ふくろう")
        names.forEach { name ->
            val part = assertNotNull(PartCatalog.byName(name))
            assertEquals(part, PartCatalog.find(PartId("うみと そら:$name")))
            assertTrue((part.def as PartDef.Raster).assetRef.matches(Regex("a/[0-9a-f]{64}")))
        }
        assertNull(PartCatalog.find(PartId("かたち:まる")))
    }

    @Test
    fun `pose variations retain a character family and have separate artwork`() {
        val poses = PartCatalog.materials.filter { it.characterId == "penguin" }
        assertTrue(poses.size >= 2)
        assertEquals(poses.size, poses.map { it.masterRef }.toSet().size)
        assertEquals(poses.size, poses.map { it.pose }.toSet().size)
    }
}
