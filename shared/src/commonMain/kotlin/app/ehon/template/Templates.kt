package app.ehon.template

import app.ehon.catalog.PartCatalog
import app.ehon.design.Argb
import app.ehon.model.PageBinding
import app.ehon.model.Book
import app.ehon.model.BookId
import app.ehon.model.ItemId
import app.ehon.model.Page
import app.ehon.model.PageShape
import app.ehon.model.PartItem
import app.ehon.store.BookCodec
import kotlinx.collections.immutable.persistentListOf
import kotlinx.collections.immutable.toPersistentList

/** A seeded part on a template page: part name, centre x%, centre y%, size%. */
data class Seed(val partName: String, val x: Float, val y: Float, val sizePct: Float)

data class TemplatePage(val promptKey: String, val seeds: List<Seed>)

/**
 * A procedural starting point: pages with prompts and seeded catalog parts, built at runtime.
 *
 * Nothing on a shelf ships this way any more: story templates are whole `.ehon` documents published
 * to the backend (decision #60) and a new book starts as [Templates.blankBook] (decision #62). The
 * blank [Template] below and the tests' own values remain the seeded books the painter baselines use.
 */
data class Template(
    val id: String,
    val nameKey: String,
    val descKey: String,
    val shape: PageShape,
    val pageCount: Int,
    val background: Argb,
    val pages: List<TemplatePage>,
    /** True for the blank template, which offers a shape picker instead. */
    val shapeIsUserChosen: Boolean = false,
)

object Templates {

    /** The four-page empty book with prompts; baseline and test scaffolding since decision #62. */
    val blank = Template(
        id = "blank",
        nameKey = "tpl.blank.name",
        descKey = "tpl.blank.desc",
        shape = PageShape.SQUARE,
        pageCount = 4,
        background = Argb.hex("f9f4ed"),
        pages = listOf(TemplatePage("tpl.blank.p1", emptyList())),
        shapeIsUserChosen = true,
    )

    val all = listOf(blank)

    fun find(id: String) = all.firstOrNull { it.id == id }

    /**
     * The blank start every shelf offers (decision #62): one white page in the given shape, no prompt,
     * nothing on it. The web and the phone both build it here, so a new book is the same document everywhere.
     */
    fun blankBook(bookId: BookId, title: String, contentLocale: String, nowEpochMs: Long, shape: PageShape = PageShape.SQUARE): Book {
        require(bookId.value.isNotBlank())
        require(nowEpochMs >= 0)
        return Book(
            id = bookId,
            title = title,
            shape = shape,
            contentLocale = contentLocale,
            pages = persistentListOf(Page(id = "p1", background = Argb.hex("ffffff"))),
            updatedAtEpochMs = nowEpochMs,
        )
    }

    /** A fetched story document becomes a new shelf copy: its own id, saved now, everything else as written. */
    fun instantiateDocument(json: String, bookId: BookId, nowEpochMs: Long): Book {
        require(bookId.value.isNotBlank())
        require(nowEpochMs >= 0)
        return BookCodec.decode(json).copy(id = bookId, updatedAtEpochMs = nowEpochMs)
    }

    /**
     * Instantiates a template into a real book.
     *
     * @param shapeOverride honoured only when the template sets [Template.shapeIsUserChosen].
     */
    fun instantiate(
        template: Template,
        bookId: BookId,
        title: String,
        contentLocale: String,
        nowEpochMs: Long,
        shapeOverride: PageShape? = null,
        idSource: IdSource = IdSource(),
    ): Book {
        val shape =
            if (template.shapeIsUserChosen) shapeOverride ?: template.shape else template.shape

        val pages = (0 until template.pageCount).map { index ->
            val source = template.pages.getOrNull(index)
            Page(
                id = "p${index + 1}",
                background = template.background,
                promptKey = source?.promptKey ?: CONTINUATION_PROMPT_KEY,
                items = (source?.seeds ?: emptyList()).mapNotNull { seed ->
                    PartCatalog.byName(seed.partName)?.let { part ->
                        PartItem(
                            id = idSource.next(),
                            x = seed.x,
                            y = seed.y,
                            partId = part.id,
                            sizePct = seed.sizePct,
                        )
                    }
                }.toPersistentList(),
                strokes = persistentListOf(),
            )
        }

        return Book(
            id = bookId,
            title = title,
            shape = shape,
            contentLocale = contentLocale,
            binding = PageBinding.LEFT,
            pages = pages.toPersistentList(),
            updatedAtEpochMs = nowEpochMs,
        )
    }

    const val CONTINUATION_PROMPT_KEY = "tpl.continue"
}

/** Sequential item ids. Injected so instantiation is deterministic under test. */
class IdSource(private val prefix: String = "i") {
    private var counter = 0

    fun next() = ItemId("$prefix${++counter}")
}
