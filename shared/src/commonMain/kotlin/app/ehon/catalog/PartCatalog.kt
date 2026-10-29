package app.ehon.catalog

import app.ehon.model.PartId
import app.ehon.model.Book
import app.ehon.model.PartItem

data class RetiredMaterial(val pageId: String, val pageNumber: Int, val itemId: String, val name: String)

@kotlinx.serialization.Serializable
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
    private data class Snapshot(val materials: List<Material>) {
        val all = materials.map { Part(PartId(it.id), it.name, it.category, PartDef.Raster(it.masterRef)) }
        val byId = all.associateBy { it.id }
        val metadata = materials.associateBy { it.id }
        val aliases = materials.flatMap { material -> material.legacyIds.map { it to material.id } }.toMap()
    }
    private var snapshot = Snapshot(StorybookMaterials.all)
    val materials: List<Material> get() = snapshot.materials
    val all: List<Part> get() = snapshot.all

    fun installJson(text: String): Boolean {
        val incoming = MaterialCatalogCodec.decode(text) ?: return false
        val current = snapshot
        val nextById = incoming.associateBy { it.id }
        // Saved books depend on both stable IDs and their legacy aliases.
        if (current.materials.any { previous -> nextById[previous.id]?.legacyIds?.containsAll(previous.legacyIds) != true }) return false
        snapshot = Snapshot(incoming)
        return true
    }
    fun materialsJson(): String = MaterialCatalogCodec.encode(materials)

    override fun find(id: PartId): Part? {
        val current = snapshot
        return current.byId[id] ?: current.aliases[id.value]?.let { current.byId[PartId(it)] }
    }
    fun inCategory(category: String): List<Part> = all.filter { it.category == category }
    fun search(category: String, query: String): List<Part> {
        val words = query.trim().lowercase().split(Regex("\\s+")).filter { it.isNotEmpty() }
        return materials.filter { material ->
            val text = listOf(material.name, material.nameEn, material.pose, material.characterId).plus(material.tags).joinToString(" ").lowercase()
            (category.isEmpty() || material.category == category) && words.all { it in text }
        }.mapNotNull { snapshot.byId[PartId(it.id)] }
    }
    fun byName(name: String): Part? = all.firstOrNull { it.nameKey == name }
    fun material(id: String): Material? = snapshot.metadata[id] ?: snapshot.aliases[id]?.let { snapshot.metadata[it] }
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
