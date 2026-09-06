package app.ehon.model

import kotlinx.serialization.Serializable

/**
 * Every face a text node can draw with. Six are offered in the もじ drawer; [UI] is chrome.
 *
 * Only [HANDWRITING] ships in the app. The other five download on first use, because a face
 * a child types into must ship *complete* (a subset falls back mid-word — see decision #10)
 * and five complete Japanese fonts would triple the download. [UI] is the Zen Maru Gothic
 * subset that already covers every shipped string; [ROUNDED] is the same family complete,
 * which is why it is a separate, downloadable entry rather than the bundled one.
 */
@Serializable
enum class FontFace(
    /** Persisted in [TextItem]; never renumber or rename. */
    val id: String,
    val nameKey: String,
    /** Family name as the platform's font registry reports it. */
    val familyName: String,
    /** Upstream Google Fonts file, for the on-demand download. */
    val fileName: String,
    val bundled: Boolean,
) {
    HANDWRITING("yomogi", "font.handwriting", "Yomogi", "Yomogi-Regular.ttf", bundled = true),
    ROUNDED("maru", "font.rounded", "Zen Maru Gothic", "ZenMaruGothic-Medium.ttf", bundled = false),
    STORYBOOK("kiwi", "font.storybook", "Kiwi Maru", "KiwiMaru-Regular.ttf", bundled = false),
    POP("pop", "font.pop", "Hachi Maru Pop", "HachiMaruPop-Regular.ttf", bundled = false),
    MARKER("marker", "font.marker", "Yusei Magic", "YuseiMagic-Regular.ttf", bundled = false),
    BOLD_ROUND("futo", "font.boldRound", "RocknRoll One", "RocknRollOne-Regular.ttf", bundled = false),

    /** Chrome only. Never offered to the child, never persisted on an item. */
    UI("ui", "", "Zen Maru Gothic", "ZenMaruGothic-Medium.ttf", bundled = true);

    companion object {
        val default: FontFace = HANDWRITING

        /** The picker's six, in display order. */
        val selectable: List<FontFace> = entries.filter { it != UI }

        fun fromId(id: String): FontFace = entries.firstOrNull { it.id == id } ?: default

        // Indexed accessors for Swift: an enum's `entries` bridges as NSArray<id>.
        val selectableCount: Int get() = selectable.size
        fun selectableAt(index: Int): FontFace = selectable[index.coerceIn(selectable.indices)]
    }
}
