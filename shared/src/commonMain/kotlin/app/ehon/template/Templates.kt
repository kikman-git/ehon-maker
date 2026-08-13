package app.ehon.template

import app.ehon.catalog.PartCatalog
import app.ehon.design.Argb
import app.ehon.model.Binding
import app.ehon.model.Book
import app.ehon.model.BookId
import app.ehon.model.ItemId
import app.ehon.model.Page
import app.ehon.model.PageShape
import app.ehon.model.PartItem
import kotlinx.collections.immutable.persistentListOf
import kotlinx.collections.immutable.toPersistentList
import kotlinx.datetime.Instant

/** A seeded part on a template page: part name, centre x%, centre y%, size%. */
data class Seed(val partName: String, val x: Float, val y: Float, val sizePct: Float)

data class TemplatePage(val promptKey: String, val seeds: List<Seed>)

/**
 * A starting point.
 *
 * Each template declares its own [shape]. That is what lets all three page shapes ship
 * without authoring every template three times — seed positions are hand-tuned per
 * template, and tuning them once at the template's own proportions costs nothing extra.
 * Shape is chosen by the parent only for the blank template, where it's meaningful.
 */
data class Template(
    val id: String,
    val nameKey: String,
    val descKey: String,
    val tagKey: String,
    val shape: PageShape,
    val pageCount: Int,
    val background: Argb,
    val pages: List<TemplatePage>,
    /** True for the blank template, which offers a shape picker instead. */
    val shapeIsUserChosen: Boolean = false,
)

object Templates {

    val all = listOf(
        Template(
            id = "t1",
            nameKey = "tpl.forest.name",
            descKey = "tpl.forest.desc",
            tagKey = "tag.creatures",
            shape = PageShape.SQUARE,
            pageCount = 8,
            background = Argb.hex("f0fae1"),
            pages = listOf(
                TemplatePage(
                    "tpl.forest.p1",
                    listOf(
                        Seed("き", 20f, 66f, 32f), Seed("き", 80f, 71f, 24f),
                        Seed("たいよう", 87f, 12f, 14f), Seed("ねこ", 50f, 68f, 26f),
                    ),
                ),
                TemplatePage(
                    "tpl.forest.p2",
                    listOf(
                        Seed("き", 15f, 70f, 26f), Seed("ことり", 58f, 34f, 18f),
                        Seed("きつね", 44f, 68f, 26f), Seed("おやま", 78f, 62f, 32f),
                    ),
                ),
                TemplatePage(
                    "tpl.forest.p3",
                    listOf(
                        Seed("くま", 32f, 64f, 30f), Seed("ふくろう", 70f, 40f, 22f),
                        Seed("はっぱ", 88f, 74f, 14f),
                    ),
                ),
                TemplatePage(
                    "tpl.forest.p4",
                    listOf(
                        Seed("にじ", 50f, 40f, 46f), Seed("くま", 30f, 74f, 22f),
                        Seed("ねこ", 66f, 76f, 18f),
                    ),
                ),
            ),
        ),
        Template(
            id = "t2",
            nameKey = "tpl.space.name",
            descKey = "tpl.space.desc",
            tagKey = "tag.adventure",
            // A wide night sky reads better landscape, and this is where a child
            // discovers that books come in shapes.
            shape = PageShape.LANDSCAPE,
            pageCount = 10,
            background = Argb.hex("2e2b25"),
            pages = listOf(
                TemplatePage(
                    "tpl.space.p1",
                    listOf(
                        Seed("ロケット", 50f, 56f, 40f), Seed("ほし", 16f, 20f, 14f),
                        Seed("きらきら", 84f, 30f, 14f),
                    ),
                ),
                TemplatePage(
                    "tpl.space.p2",
                    listOf(
                        Seed("おつきさま", 70f, 28f, 30f), Seed("ほし", 22f, 60f, 12f),
                        Seed("ロケット", 34f, 40f, 24f),
                    ),
                ),
                TemplatePage(
                    "tpl.space.p3",
                    listOf(
                        Seed("まほうのたま", 46f, 44f, 30f), Seed("ペンギン", 76f, 66f, 24f),
                        Seed("きらきら", 20f, 26f, 16f),
                    ),
                ),
            ),
        ),
        Template(
            id = "t3",
            nameKey = "tpl.sweets.name",
            descKey = "tpl.sweets.desc",
            tagKey = "tag.magic",
            // A tall shopfront wants a tall page.
            shape = PageShape.PORTRAIT,
            pageCount = 12,
            background = Argb.hex("ffe1d0"),
            pages = listOf(
                TemplatePage(
                    "tpl.sweets.p1",
                    listOf(Seed("おしろ", 50f, 56f, 46f), Seed("きらきら", 18f, 24f, 16f)),
                ),
                TemplatePage(
                    "tpl.sweets.p2",
                    listOf(Seed("まほうのたま", 34f, 54f, 28f), Seed("まほうのつえ", 68f, 50f, 30f)),
                ),
                TemplatePage(
                    "tpl.sweets.p3",
                    listOf(
                        Seed("にじ", 50f, 44f, 48f), Seed("ちょうちょ", 26f, 68f, 20f),
                        Seed("ちょうちょ", 74f, 72f, 16f),
                    ),
                ),
            ),
        ),
        Template(
            id = "t4",
            nameKey = "tpl.today.name",
            descKey = "tpl.today.desc",
            tagKey = "tag.everyday",
            shape = PageShape.SQUARE,
            pageCount = 6,
            background = Argb.hex("f9f4ed"),
            pages = listOf(
                TemplatePage("tpl.today.p1", listOf(Seed("たいよう", 76f, 24f, 24f))),
                TemplatePage(
                    "tpl.today.p2",
                    listOf(
                        Seed("くも", 30f, 24f, 30f), Seed("てんとうむし", 68f, 62f, 18f),
                        Seed("はっぱ", 40f, 74f, 20f),
                    ),
                ),
                TemplatePage(
                    "tpl.today.p3",
                    listOf(Seed("おつきさま", 72f, 26f, 24f), Seed("ほし", 24f, 34f, 12f)),
                ),
            ),
        ),
        Template(
            id = "t5",
            nameKey = "tpl.blank.name",
            descKey = "tpl.blank.desc",
            tagKey = "tag.free",
            shape = PageShape.SQUARE,
            pageCount = 4,
            background = Argb.hex("f9f4ed"),
            pages = listOf(TemplatePage("tpl.blank.p1", emptyList())),
            shapeIsUserChosen = true,
        ),
    )

    fun find(id: String) = all.firstOrNull { it.id == id }

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
        now: Instant,
        shapeOverride: PageShape? = null,
        idSource: IdSource = IdSource(),
    ): Book {
        val shape =
            if (template.shapeIsUserChosen) shapeOverride ?: template.shape else template.shape

        val pages = (0 until template.pageCount).map { index ->
            val source = template.pages.getOrNull(index)
            Page(
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
            binding = Binding.LEFT,
            pages = pages.toPersistentList(),
            updatedAt = now,
        )
    }

    const val CONTINUATION_PROMPT_KEY = "tpl.continue"
}

/** Sequential item ids. Injected so instantiation is deterministic under test. */
class IdSource(private val prefix: String = "i") {
    private var counter = 0

    fun next() = ItemId("$prefix${++counter}")
}
