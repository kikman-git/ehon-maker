package app.ehon.web

import app.ehon.catalog.Part
import app.ehon.catalog.PartCatalog
import app.ehon.catalog.PartDef
import app.ehon.catalog.PartResolver
import app.ehon.i18n.Strings
import app.ehon.model.Artwork
import app.ehon.model.Book
import app.ehon.model.PartId
import app.ehon.model.PartItem
import app.ehon.vector.SvgParser
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.put
import org.w3c.dom.HTMLImageElement

/** The open book's pictures, then library and pack parts registered by the platform, over the built-ins. */
internal class WebParts {
    private val parts = mutableMapOf<PartId, RegisteredPart>()
    var art: Map<String, Artwork> = emptyMap()
    val resolver = PartResolver { artPart(it) ?: parts[it]?.part ?: PartCatalog.find(it) }
    var imageProvider: (String) -> HTMLImageElement? = { null }

    private fun artPart(id: PartId): Part? =
        if (id.category != Artwork.CATEGORY) null
        else art[id.name]?.let { Part(id, it.name.ifEmpty { id.name }, Artwork.CATEGORY, PartDef.Vector(SvgParser.cached(it.svg))) }

    fun register(partId: String, assetRef: String, aspect: Double, nameJa: String, nameEn: String) {
        require(aspect.isFinite() && aspect > 0)
        require(isRegistrable(partId)) { "not a library or pack part: $partId" }
        require(assetRef.isNotBlank())
        val id = PartId(partId)
        parts[id] = RegisteredPart(Part(id, partId, id.category, PartDef.Raster(assetRef)), aspect, nameJa, nameEn)
    }

    fun aspect(partId: String): Double? {
        val id = PartId(partId)
        if (id.category == Artwork.CATEGORY) return art[id.name]?.let { SvgParser.cached(it.svg).aspect.toDouble() }
        return parts[id]?.aspect
    }

    fun name(partId: String, locale: String): String {
        val id = PartId(partId)
        if (id.category == Artwork.CATEGORY) return art[id.name]?.name?.ifEmpty { id.name } ?: partId
        return parts[id]?.let { if (locale.startsWith("ja")) it.nameJa else it.nameEn }
            ?: resolver.find(id)?.let { Strings.forLocale(locale)[it.nameKey] } ?: partId
    }

    /** `[{id, name, aspect}]` for a material list of the book's own pictures. */
    fun artJson(): String = buildJsonArray {
        art.forEach { (key, artwork) -> addJsonObject {
            put("id", Artwork.partId(key).value)
            put("name", artwork.name.ifEmpty { key })
            put("aspect", SvgParser.cached(artwork.svg).aspect.toDouble())
        } }
    }.toString()

    fun clear() {
        parts.clear()
        art = emptyMap()
        imageProvider = { null }
    }

    companion object {
        fun isRegistrable(partId: String) = partId.startsWith("lib:") || (partId.startsWith("pack.") && ':' in partId)

        /** Raster part ids a book depends on, so a platform can resolve them before painting. */
        fun rasterPartIds(book: Book): Array<String> = book.pages
            .flatMap { it.items }
            .filterIsInstance<PartItem>()
            .map { it.partId.value }
            .filter(::isRegistrable)
            .distinct()
            .toTypedArray()
    }
}

private data class RegisteredPart(val part: Part, val aspect: Double, val nameJa: String, val nameEn: String)
