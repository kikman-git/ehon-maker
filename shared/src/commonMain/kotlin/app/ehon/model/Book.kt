package app.ehon.model

import app.ehon.design.Argb
import kotlinx.collections.immutable.PersistentList
import kotlinx.collections.immutable.persistentListOf
import kotlinx.collections.immutable.toPersistentList
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// Deliberately data classes rather than inline value classes. A value class over String
// erases to `id` in the generated Obj-C header, so Swift would receive `Any` and every
// call site would need a cast. `Argb` stays a value class because a value class over Int
// erases to `int32_t`, which is both typed and free of boxing.

@Serializable
data class BookId(val value: String)

@Serializable
data class ItemId(val value: String)

/** `"いきもの:ねこ"` — category and name, matching the prototype's catalog keys. */
@Serializable
data class PartId(val value: String) {
    val category get() = value.substringBefore(':')
    val name get() = value.substringAfter(':')
}

/**
 * A book. Immutable: every edit produces a new value, and the previous value is
 * pushed onto [app.ehon.engine.History]. Persistent collections make that nearly
 * free — editing one item copies one list spine, not the page and not the strokes.
 */
@Serializable
data class Book(
    val id: BookId,
    val title: String,
    val shape: PageShape,
    val contentLocale: String,
    val binding: PageBinding = PageBinding.LEFT,
    @Serializable(with = PersistentListSerializer::class)
    val pages: PersistentList<Page> = persistentListOf(),
    /**
     * Epoch milliseconds, not an `Instant`. Keeping kotlinx-datetime out of the public API
     * stops a library type leaking into every Swift call site, and Firestore stores a
     * millisecond timestamp regardless.
     */
    val updatedAtEpochMs: Long,
) {
    val pageCount get() = pages.size

    /** True when the book's text should offer a furigana field and read aloud in ja. */
    val isJapanese get() = contentLocale.startsWith("ja")

    fun page(index: Int): Page = pages[index.coerceIn(0, pages.lastIndex)]

    fun mapPage(index: Int, f: (Page) -> Page): Book =
        copy(pages = pages.set(index, f(pages[index])))

    /** Attaches (or clears) a family member's voice on one page. Swift cannot copy a Page. */
    fun withReply(pageIndex: Int, reply: PageReply?): Book =
        mapPage(pageIndex.coerceIn(0, pages.lastIndex)) { it.copy(reply = reply) }

    companion object {
        /**
         * Swift/Obj-C-safe constructor.
         *
         * The generated header declares `pages` as `NSArray` because that is how Kotlin
         * `List` bridges — but the constructor's declared type is `PersistentList`, and an
         * NSArray converts to a plain `List`, so calling the primary constructor from Swift
         * throws a cast exception at runtime. This converts explicitly.
         */
        fun of(
            id: BookId,
            title: String,
            shape: PageShape,
            contentLocale: String,
            binding: PageBinding,
            pages: List<Page>,
            updatedAtEpochMs: Long,
        ) = Book(id, title, shape, contentLocale, binding, pages.toPersistentList(), updatedAtEpochMs)
    }
}

@Serializable
data class Page(
    /** Solid background from [app.ehon.design.Organic.pageBackgrounds]. Not artwork. */
    val background: Argb,
    /** Hint shown only while the page is completely untouched. */
    val promptKey: String? = null,
    @Serializable(with = PersistentListSerializer::class)
    val items: PersistentList<Item> = persistentListOf(),
    @Serializable(with = PersistentListSerializer::class)
    val strokes: PersistentList<Stroke> = persistentListOf(),
    /** A family member's voice for this page, if one has arrived. Decision 3b. */
    val reply: PageReply? = null,
) {
    val isUntouched get() = items.isEmpty() && strokes.isEmpty()

    val hasReply get() = reply != null

    /** Front-most item is last, so this is the index [Item] draws at. */
    fun indexOf(id: ItemId): Int = items.indexOfFirst { it.id == id }

    companion object {
        /** Swift/Obj-C-safe constructor — see [Book.Companion.of]. */
        fun of(
            background: Argb,
            promptKey: String?,
            items: List<Item>,
            strokes: List<Stroke>,
        ) = Page(background, promptKey, items.toPersistentList(), strokes.toPersistentList())
    }
}

/**
 * A voice message a family member left on one page — 「ばあば の こえ · 3.4びょう」.
 *
 * The audio itself is a platform file; the document holds only a reference, because a
 * book must stay well inside Firestore's 1MiB document ceiling (decision #14).
 */
@Serializable
data class PageReply(
    /** Display name as the sender chose it: ばあば, じいじ, ママ… */
    val from: String,
    val seconds: Float,
    /** Platform-resolved audio id; null for a reply whose audio has not arrived yet. */
    val audioRef: String? = null,
    val recordedAtEpochMs: Long = 0L,
)

/**
 * Anything placed on a page. Positions are percent-of-page and centre-anchored,
 * exactly as the prototype stores them — which is what makes a page resolution
 * independent, and also why [PageShape] cannot change after creation.
 */
/**
 * Subtypes carry explicit [SerialName]s so the persisted discriminator is `"part"` /
 * `"text"` rather than a fully-qualified class name — renaming a class must not orphan
 * every book already saved on a device.
 */
@Serializable
sealed interface Item {
    val id: ItemId

    /** 0..100, percent of page width, centre of the item. */
    val x: Float

    /** 0..100, percent of page height, centre of the item. */
    val y: Float

    val rotationDeg: Float

    fun movedTo(x: Float, y: Float): Item
}

@Serializable
@SerialName("part")
data class PartItem(
    override val id: ItemId,
    override val x: Float,
    override val y: Float,
    override val rotationDeg: Float = 0f,
    val partId: PartId,
    /** Percent of page *width*. Parts are square, so this drives both dimensions. */
    val sizePct: Float = 26f,
) : Item {
    override fun movedTo(x: Float, y: Float) = copy(x = x, y = y)

    fun resizedBy(factor: Float) = copy(sizePct = (sizePct * factor).coerceIn(MIN, MAX))

    fun rotatedBy(deg: Float) = copy(rotationDeg = (rotationDeg + deg).mod(360f))

    companion object {
        const val MIN = 4f
        const val MAX = 90f
        const val STEP_UP = 1.18f
        const val STEP_DOWN = 0.84f
        const val ROTATE_STEP = 15f
    }
}

@Serializable
@SerialName("text")
data class TextItem(
    override val id: ItemId,
    override val x: Float,
    override val y: Float,
    override val rotationDeg: Float = 0f,
    val text: String,
    /** Group-ruby reading for the whole string. Null outside Japanese books. */
    val ruby: String? = null,
    val colorIndex: Int = 0,
    /** Percent of page width; one of [SIZES]. */
    val sizePct: Float = SIZES[1],
    val font: FontFace = FontFace.default,
) : Item {
    override fun movedTo(x: Float, y: Float) = copy(x = x, y = y)

    val hasRuby get() = !ruby.isNullOrBlank()

    companion object {
        /** ちいさい / ふつう / おおきい, from the 2a prototype's `[5, 6.5, 8.5]`. */
        val SIZES = listOf(5f, 6.5f, 8.5f)

        /** Text renders slightly larger than its nominal percentage, per the prototype. */
        const val OPTICAL_SCALE = 1.05f

        /** Ruby sits at half the base size, per `<rt style="font-size:.5em">`. */
        const val RUBY_SCALE = 0.5f
    }
}

/** A finger stroke. Points are normalised 0..1 so they survive any output resolution. */
@Serializable
data class Stroke(
    val ink: Ink,
    /** Brush step 1..3; painted width is `step * WIDTH_UNIT` in page-relative units. */
    val brushStep: Int,
    @Serializable(with = PersistentListSerializer::class)
    val points: PersistentList<StrokePoint>,
) {
    companion object {
        /** The prototype's brush width in its fixed 322px page. */
        private const val WIDTH_UNIT_AT_REFERENCE = 3.2f
        private const val REFERENCE_PAGE_WIDTH = 322f

        /**
         * Brush width as a *fraction of page width*, not a pixel count.
         *
         * The prototype hardcodes `brush * 3.2` px against a 322px page. Carried over
         * literally, a 300dpi print page of 1535px would draw the same 3.2 dots — a
         * hairline where the child drew a crayon line. Widths have to scale with the
         * page for the same reason stroke points are normalised.
         */
        fun widthFraction(brushStep: Int): Float =
            brushStep * WIDTH_UNIT_AT_REFERENCE / REFERENCE_PAGE_WIDTH
    }
}

@Serializable
data class StrokePoint(val x: Float, val y: Float)

@Serializable
sealed interface Ink {
    @Serializable
    @SerialName("crayon")
    data class Crayon(val index: Int) : Ink

    @Serializable
    @SerialName("eraser")
    data object Eraser : Ink
}
