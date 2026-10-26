package app.ehon.i18n

import app.ehon.catalog.PartCatalog

class Strings private constructor(
    val locale: String,
    private val table: Map<String, String>,
    private val fallback: Map<String, String>?,
) {
    operator fun get(key: String): String =
        PartCatalog.localizedName(key.removePrefix(PART_PREFIX), locale) ?: table[key] ?: derivedPartName(key) ?: fallback?.get(key) ?: key

    fun format(key: String, args: List<String>): String {
        var result = get(key)
        args.forEach { result = result.replaceFirst("%s", it) }
        return result
    }

    private fun derivedPartName(key: String): String? =
        if (locale.startsWith("ja") && key.startsWith(PART_PREFIX)) {
            key.removePrefix(PART_PREFIX)
        } else {
            null
        }

    companion object {
        const val PART_PREFIX = "part."

        val JAPANESE = "ja"
        val ENGLISH = "en"

        val supported = listOf(JAPANESE, ENGLISH)

        private val english by lazy { Strings(ENGLISH, StringsEn.table, null) }

        fun forLocale(deviceLocale: String): Strings =
            if (deviceLocale.startsWith("ja")) Strings(JAPANESE, StringsJa.table, StringsEn.table)
            else english

        fun allShippedText(): List<String> =
            StringsJa.table.values + StringsEn.table.values +
                PartCatalog.all.map { it.nameKey } +
                PartCatalog.categories
    }
}
