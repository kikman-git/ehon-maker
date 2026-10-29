package app.ehon.catalog

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
private data class MaterialIndex(val version: Int, val styleId: String, val assets: List<Material>)

internal object MaterialCatalogCodec {
    private val json = Json { ignoreUnknownKeys = true }
    private val id = Regex("pack\\.storybook:[a-z0-9-]{1,80}")
    private val ref = Regex("a/[0-9a-f]{64}")

    fun decode(text: String): List<Material>? = try {
        require(text.length <= 2_000_000)
        val index = json.decodeFromString<MaterialIndex>(text)
        require(index.version == 1 && index.styleId == "painterly-storybook-v1")
        require(index.assets.isNotEmpty() && index.assets.size <= 1000)
        require(index.assets.map { it.id }.distinct().size == index.assets.size)
        val aliases = mutableSetOf<String>()
        index.assets.forEach { asset ->
            require(id.matches(asset.id) && ref.matches(asset.masterRef))
            require(asset.category in StorybookMaterials.categories)
            require(listOf(asset.name, asset.nameEn, asset.characterId, asset.pose).all { it.isNotBlank() && it.length <= 160 })
            require(asset.tags.size <= 40 && asset.tags.all { it.length <= 100 })
            require(asset.legacyIds.size <= 20)
            asset.legacyIds.forEach {
                require(it.substringBefore(':') in setOf("かたち", "いきもの", "うみと そら", "しぜん", "まほう") && it.length <= 100)
                require(aliases.add(it))
            }
        }
        index.assets
    } catch (_: Exception) { null }

    fun encode(materials: List<Material>): String = json.encodeToString(MaterialIndex(1, "painterly-storybook-v1", materials))
}
