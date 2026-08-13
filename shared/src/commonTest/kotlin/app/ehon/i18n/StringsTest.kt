package app.ehon.i18n

import app.ehon.catalog.PartCatalog
import app.ehon.template.Templates
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class StringsTest {

    private val ja = Strings.forLocale("ja-JP")
    private val en = Strings.forLocale("en-US")

    @Test
    fun `every declared key resolves in both locales`() {
        val missing = mutableListOf<String>()
        StringKeys.all.forEach { key ->
            if (ja[key] == key) missing += "ja:$key"
            if (en[key] == key) missing += "en:$key"
        }
        assertTrue(missing.isEmpty(), "unresolved keys: $missing")
    }

    @Test
    fun `japanese part names are derived from their keys, so none are duplicated`() {
        assertEquals("ねこ", ja["part.ねこ"])
        assertEquals("Cat", en["part.ねこ"])
        // The ja table must not restate what the key already says.
        assertTrue(StringsJa.table.keys.none { it.startsWith(Strings.PART_PREFIX) })
    }

    @Test
    fun `english covers all 56 part names`() {
        val absent = PartCatalog.all
            .map { "part.${it.nameKey}" }
            .filter { StringsEn.table[it] == null }
        assertTrue(absent.isEmpty(), "English is missing: $absent")
    }

    @Test
    fun `english defines every key japanese does, so it can be the fallback`() {
        val onlyInJa = StringsJa.table.keys - StringsEn.table.keys
        assertTrue(onlyInJa.isEmpty(), "English lacks: $onlyInJa")
    }

    @Test
    fun `a non-japanese device falls back to english rather than showing japanese`() {
        listOf("de-DE", "fr-FR", "en-GB", "ko-KR", "zh-Hant").forEach { locale ->
            assertEquals(Strings.ENGLISH, Strings.forLocale(locale).locale, "for $locale")
        }
        assertEquals(Strings.JAPANESE, Strings.forLocale("ja-JP").locale)
    }

    @Test
    fun `every template's name, description and prompt keys resolve`() {
        Templates.all.forEach { template ->
            listOf(template.nameKey, template.descKey, template.tagKey).forEach { key ->
                assertTrue(ja[key] != key, "ja missing $key")
                assertTrue(en[key] != key, "en missing $key")
            }
            template.pages.forEach { page ->
                assertTrue(ja[page.promptKey] != page.promptKey, "ja missing ${page.promptKey}")
                assertTrue(en[page.promptKey] != page.promptKey, "en missing ${page.promptKey}")
            }
        }
        assertTrue(ja[Templates.CONTINUATION_PROMPT_KEY] != Templates.CONTINUATION_PROMPT_KEY)
    }

    @Test
    fun `format substitutes positionally`() {
        assertEquals("ページ 2 / 8", ja.format("editor.pageLabel", listOf("2", "8")))
        assertEquals("Page 2 / 8", en.format("editor.pageLabel", listOf("2", "8")))
    }

    @Test
    fun `an unknown key returns itself rather than throwing`() {
        assertEquals("nope.missing", ja["nope.missing"])
    }

    /** The font subset step consumes this; empty output would silently ship tofu. */
    @Test
    fun `shipped text inventory is non-trivial and covers both locales`() {
        val all = Strings.allShippedText()
        assertTrue(all.size > 200, "only ${all.size} strings for the subset")
        assertTrue(all.any { it.contains("ほんだな") })
        assertTrue(all.any { it.contains("Bookshelf") })
    }
}
