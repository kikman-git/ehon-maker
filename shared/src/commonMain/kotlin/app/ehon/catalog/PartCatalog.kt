package app.ehon.catalog

import app.ehon.model.PartId
import app.ehon.model.Book
import app.ehon.model.PartItem

data class RetiredMaterial(val pageId: String, val pageNumber: Int, val itemId: String, val name: String)

data class Material(
    val id: String,
    val name: String,
    val nameEn: String,
    val category: String,
    val masterRef: String,
    val characterId: String,
    val pose: String,
    val tags: List<String>,
    val legacyIds: List<String>,
)

object PartCatalog : PartResolver {
    const val CAT_NATURE = "しぜん"
    val categories: List<String> = StorybookMaterials.categories
    val materials: List<Material> = StorybookMaterials.all
    val all: List<Part> = materials.map {
        Part(PartId(it.id), it.name, it.category, PartDef.Raster(it.masterRef))
    }
    private val byId = all.associateBy { it.id }
    private val metadata = materials.associateBy { it.id }
    private val aliases = materials.flatMap { material -> material.legacyIds.map { it to material.id } }.toMap()

    override fun find(id: PartId): Part? = byId[id] ?: aliases[id.value]?.let { byId[PartId(it)] }
    fun inCategory(category: String): List<Part> = all.filter { it.category == category }
    fun search(category: String, query: String): List<Part> {
        val words = query.trim().lowercase().split(Regex("\\s+")).filter { it.isNotEmpty() }
        return materials.filter { material ->
            val text = listOf(material.name, material.nameEn, material.pose, material.characterId).plus(material.tags).joinToString(" ").lowercase()
            (category.isEmpty() || material.category == category) && words.all { it in text }
        }.mapNotNull { byId[PartId(it.id)] }
    }
    fun byName(name: String): Part? = all.firstOrNull { it.nameKey == name }
    fun material(id: String): Material? = metadata[id] ?: aliases[id]?.let { metadata[it] }
    fun isRetired(id: PartId): Boolean = id.value.substringBefore(':') in
        setOf("かたち", "いきもの", "うみと そら", "しぜん", "まほう") && find(id) == null

    fun retiredIn(book: Book): List<RetiredMaterial> = book.pages.flatMapIndexed { index, page ->
        page.items.filterIsInstance<PartItem>().filter { isRetired(it.partId) }.map {
            RetiredMaterial(page.id, index + 1, it.id.value, it.partId.value.substringAfter(':'))
        }
    }
    fun localizedName(name: String, locale: String): String? = materials.firstOrNull { it.name == name }?.let {
        if (locale.startsWith("ja")) it.name else it.nameEn
    }
}
