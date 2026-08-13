package app.ehon.i18n

import app.ehon.catalog.PartCatalog

/**
 * Localised chrome, held in the shared core rather than in platform resource files.
 *
 * One source means: no ja/en drift between iOS and Android, a single input for the font
 * subset build step (decision #10), and a test that can assert every locale defines every
 * key. Store-listing metadata is localised separately, in each store's console.
 */
class Strings private constructor(
    val locale: String,
    private val table: Map<String, String>,
    private val fallback: Map<String, String>?,
) {
    /**
     * Order matters: the locale's own derivation must beat the fallback, or a Japanese
     * part name resolves to its English entry instead of to the key it already carries.
     */
    operator fun get(key: String): String =
        table[key] ?: derivedPartName(key) ?: fallback?.get(key) ?: key

    /**
     * Substitutes `%s` placeholders positionally.
     *
     * Takes a list rather than a `vararg`: a Kotlin vararg crosses the Obj-C boundary as
     * `KotlinArray<AnyObject>`, which Swift cannot construct from an ordinary array.
     */
    fun format(key: String, args: List<String>): String {
        var result = get(key)
        args.forEach { result = result.replaceFirst("%s", it) }
        return result
    }

    /**
     * Japanese part names are their own keys (`part.ねこ`), so ja needs no entries for the
     * 56 of them. Other locales list them explicitly.
     */
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

        /** Every locale the app ships. Decision #18. */
        val supported = listOf(JAPANESE, ENGLISH)

        private val english by lazy { Strings(ENGLISH, StringsEn.table, null) }

        /** English is the fallback for any device language that isn't Japanese. */
        fun forLocale(deviceLocale: String): Strings =
            if (deviceLocale.startsWith("ja")) Strings(JAPANESE, StringsJa.table, StringsEn.table)
            else english

        /** All shipped strings, for the font subset step. */
        fun allShippedText(): List<String> =
            StringsJa.table.values + StringsEn.table.values +
                PartCatalog.all.map { it.nameKey } +
                PartCatalog.categories
    }
}
