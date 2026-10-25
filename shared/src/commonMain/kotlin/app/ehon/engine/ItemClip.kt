package app.ehon.engine

import app.ehon.model.Artwork
import app.ehon.model.Item
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/** One copied item and, for a picture embedded in its book, the art it needs to paste into another book. */
@Serializable
data class ItemClip(
    val ehonClip: Int = VERSION,
    val item: Item,
    val art: Artwork? = null,
) {
    companion object {
        const val VERSION = 1

        /** Not the system clipboard's text/plain, so pasting into another app gets words rather than JSON. */
        const val MIME = "application/x-ehon-item+json"

        private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

        fun encode(clip: ItemClip): String = json.encodeToString(clip)

        fun decodeOrNull(text: String): ItemClip? =
            runCatching { json.decodeFromString<ItemClip>(text) }.getOrNull()?.takeIf { it.ehonClip == VERSION }
    }
}
