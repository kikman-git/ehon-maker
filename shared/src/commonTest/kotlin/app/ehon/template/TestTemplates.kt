package app.ehon.template

import app.ehon.design.Argb
import app.ehon.model.PageShape


object TestTemplates {
    val t1 = Template(
        id = "t1",
        nameKey = "tpl.blank.name",
        descKey = "tpl.blank.desc",
        shape = PageShape.SQUARE,
        pageCount = 8,
        background = Argb.hex("f0fae1"),
        pages = listOf(
            TemplatePage(
                "tpl.blank.p1",
                listOf(
                    Seed("き", 20f, 66f, 32f), Seed("き", 80f, 71f, 24f),
                    Seed("くも", 87f, 12f, 14f), Seed("ことり", 50f, 68f, 26f),
                ),
            ),
            TemplatePage(
                "tpl.continue",
                listOf(
                    Seed("き", 15f, 70f, 26f), Seed("ことり", 58f, 34f, 18f),
                    Seed("かめ", 44f, 68f, 26f), Seed("もりのこみち", 78f, 62f, 32f),
                ),
            ),
            TemplatePage(
                "tpl.continue",
                listOf(Seed("ペンギン", 32f, 64f, 30f), Seed("ふくろう", 70f, 40f, 22f), Seed("りんご", 88f, 74f, 14f)),
            ),
            TemplatePage(
                "tpl.continue",
                listOf(Seed("くも", 50f, 40f, 46f), Seed("ペンギン", 30f, 74f, 22f), Seed("ことり", 66f, 76f, 18f)),
            ),
        ),
    )

    val t2 = Template(
        id = "t2",
        nameKey = "tpl.blank.name",
        descKey = "tpl.blank.desc",
        shape = PageShape.LANDSCAPE,
        pageCount = 10,
        background = Argb.hex("2e2b25"),
        pages = listOf(
            TemplatePage("tpl.blank.p1", listOf(Seed("バス", 50f, 56f, 40f), Seed("ランタン", 16f, 20f, 14f), Seed("ちょうちょ", 84f, 30f, 14f))),
            TemplatePage("tpl.continue", listOf(Seed("くも", 70f, 28f, 30f), Seed("ランタン", 22f, 60f, 12f), Seed("バス", 34f, 40f, 24f))),
            TemplatePage("tpl.continue", listOf(Seed("かぼちゃ", 46f, 44f, 30f), Seed("ペンギン", 76f, 66f, 24f), Seed("ちょうちょ", 20f, 26f, 16f))),
        ),
    )

    val all = listOf(t1, t2, Templates.blank)

    fun find(id: String): Template = all.first { it.id == id }
}
