package app.ehon.catalog

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull

class MaterialCatalogCodecTest {
    @Test
    fun `catalog schema accepts new paintings and rejects malformed catalogs`() {
        val base = PartCatalog.materialsJson()
        assertEquals(StorybookMaterials.all, MaterialCatalogCodec.decode(base))
        assertNull(MaterialCatalogCodec.decode(base.replace("\"version\":1", "\"version\":2")))
        assertNull(MaterialCatalogCodec.decode(base.replace("painterly-storybook-v1", "other-style")))
        assertNull(MaterialCatalogCodec.decode(base.replaceFirst("pack.storybook:bird", "lib:injected")))
        assertNull(MaterialCatalogCodec.decode(base.replaceFirst("pack.storybook:bird-flying", "pack.storybook:bird")))
        assertNull(MaterialCatalogCodec.decode(base.replaceFirst(StorybookMaterials.all.first().masterRef, "a/../../secret")))
        assertNull(MaterialCatalogCodec.decode("{}"))
    }

    @Test
    fun `updates cannot remove materials or discard and reassign legacy aliases`() {
        val original = PartCatalog.materials
        val owner = original.first { it.legacyIds.isNotEmpty() }
        assertFalse(PartCatalog.installJson(MaterialCatalogCodec.encode(original.filterNot { it.id == owner.id })))
        val withoutAliases = original.map { if (it.id == owner.id) it.copy(legacyIds = emptyList()) else it }
        assertFalse(PartCatalog.installJson(MaterialCatalogCodec.encode(withoutAliases)))
        val reassigned = withoutAliases + owner.copy(id = "pack.storybook:reassigned")
        assertFalse(PartCatalog.installJson(MaterialCatalogCodec.encode(reassigned)))
        assertEquals(original, PartCatalog.materials)
    }
}
