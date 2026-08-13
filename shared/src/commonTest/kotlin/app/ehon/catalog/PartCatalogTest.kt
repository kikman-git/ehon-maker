package app.ehon.catalog

import app.ehon.design.Organic
import app.ehon.template.Templates
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class PartCatalogTest {

    @Test
    fun `catalog has the prototype's 56 parts in the expected distribution`() {
        assertEquals(56, PartCatalog.all.size)
        assertEquals(6, PartCatalog.inCategory(PartCatalog.CAT_SHAPES).size)
        assertEquals(21, PartCatalog.inCategory(PartCatalog.CAT_CREATURES).size)
        assertEquals(17, PartCatalog.inCategory(PartCatalog.CAT_SEA_SKY).size)
        assertEquals(6, PartCatalog.inCategory(PartCatalog.CAT_NATURE).size)
        assertEquals(6, PartCatalog.inCategory(PartCatalog.CAT_MAGIC).size)
    }

    @Test
    fun `part ids are unique`() {
        assertEquals(PartCatalog.all.size, PartCatalog.all.map { it.id }.toSet().size)
    }

    @Test
    fun `every layer colour is a real crayon index`() {
        PartCatalog.all.forEach { part ->
            val layers = (part.def as PartDef.Primitives).layers
            assertTrue(layers.isNotEmpty(), "${part.id.value} has no layers")
            layers.forEach { layer ->
                assertTrue(
                    layer.colorIndex in Organic.crayons.indices,
                    "${part.id.value} references crayon ${layer.colorIndex}",
                )
            }
        }
    }

    @Test
    fun `every template seed resolves to a catalog part`() {
        Templates.all.forEach { template ->
            template.pages.forEach { page ->
                page.seeds.forEach { seed ->
                    assertNotNull(
                        PartCatalog.byName(seed.partName),
                        "${template.id} seeds unknown part ${seed.partName}",
                    )
                }
            }
        }
    }

    @Test
    fun `mask ratios match the CSS radial-gradient geometry`() {
        // farthest-corner of a unit square from its centre is √2/2 ≈ 0.7071, so a 58%
        // stop lands at 0.410 of the box side against an outer radius of 0.5.
        assertClose(0.8202f, MaskGeometry.RING_INNER_RATIO)
        assertClose(0.8768f, MaskGeometry.ARC_INNER_RATIO)
        assertClose(0.8751f, MaskGeometry.CRESCENT_CUT_RADIUS)
    }

    @Test
    fun `shapes needing even-odd fills are exactly the three former masks`() {
        assertEquals(
            setOf(ShapeKind.RING, ShapeKind.CRESCENT, ShapeKind.ARC),
            ShapeKind.entries.filter { it.isEvenOdd }.toSet(),
        )
    }

    private fun assertClose(expected: Float, actual: Float, tolerance: Float = 0.001f) =
        assertTrue(
            kotlin.math.abs(expected - actual) < tolerance,
            "expected ~$expected but was $actual",
        )
}
