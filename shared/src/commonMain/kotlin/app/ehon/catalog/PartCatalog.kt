package app.ehon.catalog

import app.ehon.catalog.ShapeKind.ARC
import app.ehon.catalog.ShapeKind.CIRCLE
import app.ehon.catalog.ShapeKind.CRESCENT
import app.ehon.catalog.ShapeKind.DIAMOND
import app.ehon.catalog.ShapeKind.LEAF
import app.ehon.catalog.ShapeKind.PILL
import app.ehon.catalog.ShapeKind.RING
import app.ehon.catalog.ShapeKind.SQUIRCLE
import app.ehon.catalog.ShapeKind.STAR
import app.ehon.catalog.ShapeKind.TRIANGLE
import app.ehon.model.PartId

/**
 * The 56 procedural parts, transcribed from the prototype's `RAW` table.
 *
 * Layer order is paint order: back to front. Coordinates are percent of the part box.
 * Colour numbers index [app.ehon.design.Organic.crayons].
 *
 * These remain the fixture the golden tests render against even after commissioned
 * raster art lands, because they are deterministic and need no assets — see
 * [PartDef.Primitives].
 */
object PartCatalog {

    const val CAT_SHAPES = "かたち"
    const val CAT_CREATURES = "いきもの"
    const val CAT_SEA_SKY = "うみと そら"
    const val CAT_NATURE = "しぜん"
    const val CAT_MAGIC = "まほう"

    val categories = listOf(CAT_SHAPES, CAT_CREATURES, CAT_SEA_SKY, CAT_NATURE, CAT_MAGIC)

    private fun c(x: Float, y: Float, w: Float, h: Float, k: Int, r: Float = 0f) =
        Layer(CIRCLE, x, y, w, h, k, r)

    private fun s(x: Float, y: Float, w: Float, h: Float, k: Int, r: Float = 0f) =
        Layer(SQUIRCLE, x, y, w, h, k, r)

    private fun p(x: Float, y: Float, w: Float, h: Float, k: Int, r: Float = 0f) =
        Layer(PILL, x, y, w, h, k, r)

    private fun t(x: Float, y: Float, w: Float, h: Float, k: Int, r: Float = 0f) =
        Layer(TRIANGLE, x, y, w, h, k, r)

    private fun d(x: Float, y: Float, w: Float, h: Float, k: Int, r: Float = 0f) =
        Layer(DIAMOND, x, y, w, h, k, r)

    private fun st(x: Float, y: Float, w: Float, h: Float, k: Int, r: Float = 0f) =
        Layer(STAR, x, y, w, h, k, r)

    private fun lf(x: Float, y: Float, w: Float, h: Float, k: Int, r: Float = 0f) =
        Layer(LEAF, x, y, w, h, k, r)

    private fun ring(x: Float, y: Float, w: Float, h: Float, k: Int, r: Float = 0f) =
        Layer(RING, x, y, w, h, k, r)

    private fun cres(x: Float, y: Float, w: Float, h: Float, k: Int, r: Float = 0f) =
        Layer(CRESCENT, x, y, w, h, k, r)

    private fun arc(x: Float, y: Float, w: Float, h: Float, k: Int, r: Float = 0f) =
        Layer(ARC, x, y, w, h, k, r)

    private val raw: Map<String, List<Pair<String, List<Layer>>>> = mapOf(
        CAT_SHAPES to listOf(
            "まる" to listOf(c(10f, 10f, 80f, 80f, 1)),
            "さんかく" to listOf(t(6f, 10f, 88f, 80f, 2)),
            "しかく" to listOf(s(12f, 12f, 76f, 76f, 3)),
            "ほし" to listOf(st(4f, 6f, 92f, 88f, 2)),
            "ハート" to listOf(
                c(10f, 16f, 44f, 44f, 0), c(46f, 16f, 44f, 44f, 0), d(18f, 26f, 64f, 64f, 0),
            ),
            "にじ" to listOf(
                arc(0f, 0f, 100f, 100f, 0), arc(13f, 13f, 74f, 74f, 2), arc(26f, 26f, 48f, 48f, 3),
            ),
        ),

        CAT_CREATURES to listOf(
            "ねこ" to listOf(
                t(14f, 4f, 26f, 30f, 6), t(60f, 4f, 26f, 30f, 6), c(10f, 22f, 80f, 72f, 6),
                c(32f, 50f, 9f, 9f, 7), c(59f, 50f, 9f, 9f, 7),
            ),
            "いぬ" to listOf(
                p(6f, 16f, 20f, 42f, 6, -12f), p(74f, 16f, 20f, 42f, 6, 12f),
                c(16f, 14f, 68f, 68f, 1), c(34f, 46f, 32f, 32f, 8),
                c(30f, 32f, 10f, 10f, 7), c(60f, 32f, 10f, 10f, 7), c(44f, 54f, 12f, 11f, 7),
            ),
            "くま" to listOf(
                c(8f, 6f, 28f, 28f, 6), c(64f, 6f, 28f, 28f, 6), c(10f, 20f, 80f, 74f, 6),
                c(36f, 52f, 28f, 24f, 8), c(45f, 58f, 10f, 9f, 7),
            ),
            "うさぎ" to listOf(
                p(28f, 0f, 14f, 44f, 0, -8f), p(58f, 0f, 14f, 44f, 0, 8f),
                c(16f, 34f, 68f, 62f, 8), c(36f, 58f, 9f, 8f, 7), c(55f, 58f, 9f, 8f, 7),
            ),
            "ぞう" to listOf(
                c(0f, 18f, 34f, 42f, 4), c(66f, 18f, 34f, 42f, 4), c(20f, 12f, 60f, 60f, 4),
                p(42f, 54f, 16f, 44f, 4), c(32f, 34f, 9f, 9f, 7), c(59f, 34f, 9f, 9f, 7),
            ),
            "ぶた" to listOf(
                t(12f, 4f, 24f, 26f, 0), t(64f, 4f, 24f, 26f, 0), c(10f, 18f, 80f, 76f, 0),
                c(32f, 50f, 36f, 28f, 8), c(39f, 58f, 7f, 9f, 7), c(54f, 58f, 7f, 9f, 7),
                c(28f, 34f, 9f, 9f, 7), c(63f, 34f, 9f, 9f, 7),
            ),
            "ひつじ" to listOf(
                c(2f, 16f, 40f, 40f, 8), c(26f, 4f, 44f, 44f, 8), c(58f, 14f, 40f, 40f, 8),
                c(10f, 44f, 42f, 42f, 8), c(48f, 46f, 42f, 42f, 8), c(32f, 38f, 36f, 42f, 7),
                c(39f, 50f, 7f, 7f, 8), c(54f, 50f, 7f, 7f, 8),
            ),
            "きつね" to listOf(
                t(8f, 0f, 28f, 34f, 1), t(64f, 0f, 28f, 34f, 1), t(8f, 18f, 84f, 76f, 1, 180f),
                t(30f, 44f, 40f, 40f, 8, 180f), c(26f, 38f, 10f, 10f, 7), c(64f, 38f, 10f, 10f, 7),
            ),
            "パンダ" to listOf(
                c(6f, 2f, 26f, 26f, 7), c(68f, 2f, 26f, 26f, 7), c(10f, 14f, 80f, 78f, 8),
                c(24f, 36f, 22f, 24f, 7), c(54f, 36f, 22f, 24f, 7), c(44f, 58f, 12f, 10f, 7),
            ),
            "かえる" to listOf(
                c(10f, 2f, 30f, 30f, 3), c(60f, 2f, 30f, 30f, 3),
                c(16f, 8f, 18f, 18f, 8), c(66f, 8f, 18f, 18f, 8),
                c(21f, 13f, 9f, 9f, 7), c(71f, 13f, 9f, 9f, 7),
                c(6f, 26f, 88f, 66f, 3), p(28f, 66f, 44f, 8f, 7),
            ),
            "ライオン" to listOf(
                c(0f, 0f, 100f, 100f, 2), c(14f, 14f, 72f, 72f, 1),
                c(30f, 36f, 10f, 10f, 7), c(60f, 36f, 10f, 10f, 7),
                c(36f, 52f, 28f, 26f, 8), t(44f, 56f, 12f, 11f, 7, 180f),
            ),
            "ねずみ" to listOf(
                c(2f, 4f, 34f, 34f, 5), c(64f, 4f, 34f, 34f, 5),
                c(9f, 11f, 20f, 20f, 8), c(71f, 11f, 20f, 20f, 8),
                c(16f, 26f, 68f, 66f, 5), c(32f, 46f, 9f, 9f, 7), c(59f, 46f, 9f, 9f, 7),
                c(44f, 74f, 12f, 12f, 7),
            ),
            "とら" to listOf(
                c(6f, 2f, 26f, 26f, 2), c(68f, 2f, 26f, 26f, 2), c(8f, 16f, 84f, 78f, 2),
                p(17f, 26f, 8f, 22f, 7, 18f), p(75f, 26f, 8f, 22f, 7, -18f),
                c(28f, 42f, 10f, 10f, 7), c(62f, 42f, 10f, 10f, 7),
                c(34f, 58f, 32f, 26f, 8), t(44f, 60f, 12f, 11f, 7, 180f),
            ),
            "きりん" to listOf(
                p(40f, 30f, 20f, 68f, 2), p(33f, 0f, 7f, 18f, 6), p(60f, 0f, 7f, 18f, 6),
                c(24f, 6f, 52f, 46f, 2), c(34f, 22f, 9f, 9f, 7), c(57f, 22f, 9f, 9f, 7),
                c(42f, 56f, 12f, 12f, 6), c(42f, 78f, 12f, 12f, 6),
            ),
            "さる" to listOf(
                c(0f, 26f, 26f, 26f, 6), c(74f, 26f, 26f, 26f, 6), c(12f, 8f, 76f, 76f, 6),
                c(24f, 30f, 52f, 52f, 8), c(34f, 42f, 9f, 9f, 7), c(57f, 42f, 9f, 9f, 7),
                c(45f, 58f, 10f, 9f, 6),
            ),
            "うし" to listOf(
                c(4f, 4f, 22f, 18f, 2), c(74f, 4f, 22f, 18f, 2),
                c(0f, 22f, 22f, 24f, 8), c(78f, 22f, 22f, 24f, 8),
                c(12f, 14f, 76f, 78f, 8), c(18f, 22f, 26f, 26f, 7),
                c(32f, 44f, 10f, 10f, 7), c(58f, 44f, 10f, 10f, 7),
                c(30f, 62f, 40f, 28f, 0), c(38f, 70f, 7f, 8f, 7), c(55f, 70f, 7f, 8f, 7),
            ),
            "うま" to listOf(
                t(20f, 0f, 18f, 22f, 1), t(56f, 0f, 18f, 22f, 1), p(60f, 10f, 18f, 54f, 6, 8f),
                s(24f, 14f, 44f, 54f, 1), c(22f, 56f, 40f, 38f, 1),
                c(32f, 32f, 10f, 10f, 7), c(32f, 72f, 9f, 9f, 7),
            ),
            "コアラ" to listOf(
                c(0f, 8f, 34f, 34f, 5), c(66f, 8f, 34f, 34f, 5),
                c(7f, 15f, 20f, 20f, 8), c(73f, 15f, 20f, 20f, 8),
                c(14f, 20f, 72f, 72f, 5), c(30f, 44f, 10f, 10f, 7), c(60f, 44f, 10f, 10f, 7),
                s(40f, 58f, 20f, 26f, 7),
            ),
            "りす" to listOf(
                c(60f, 8f, 40f, 60f, 1), c(68f, 22f, 24f, 34f, 2), c(10f, 30f, 54f, 62f, 1),
                t(22f, 0f, 14f, 16f, 1), c(16f, 10f, 40f, 40f, 1), c(28f, 24f, 9f, 9f, 7),
            ),
            "はりねずみ" to listOf(
                t(4f, 18f, 24f, 34f, 6, -22f), t(26f, 4f, 24f, 34f, 6, -8f),
                t(48f, 4f, 24f, 34f, 6, 8f), t(70f, 18f, 24f, 34f, 6, 22f),
                c(6f, 34f, 88f, 58f, 6), c(2f, 48f, 40f, 40f, 8),
                c(12f, 60f, 9f, 9f, 7), c(2f, 66f, 12f, 12f, 7),
            ),
            "かたつむり" to listOf(
                p(2f, 62f, 76f, 24f, 3), c(0f, 44f, 32f, 32f, 3),
                p(5f, 22f, 6f, 26f, 3, -12f), p(20f, 22f, 6f, 26f, 3, 10f),
                ring(34f, 18f, 62f, 62f, 1), c(50f, 34f, 30f, 30f, 1), c(9f, 52f, 9f, 9f, 7),
            ),
        ),

        CAT_SEA_SKY to listOf(
            "ことり" to listOf(
                t(2f, 44f, 28f, 24f, 4), c(20f, 20f, 58f, 58f, 4),
                t(70f, 44f, 22f, 18f, 2, 90f), c(38f, 36f, 9f, 9f, 7),
            ),
            "ちょうちょ" to listOf(
                c(4f, 12f, 44f, 38f, 5), c(52f, 12f, 44f, 38f, 5),
                c(4f, 50f, 44f, 38f, 5), c(52f, 50f, 44f, 38f, 5), p(46f, 8f, 8f, 84f, 7),
            ),
            "さかな" to listOf(
                t(0f, 28f, 30f, 44f, 3, -90f), c(24f, 24f, 56f, 52f, 3), c(60f, 40f, 10f, 10f, 8),
            ),
            "かめ" to listOf(
                c(0f, 44f, 26f, 22f, 6), c(74f, 44f, 26f, 22f, 6), c(38f, 2f, 24f, 24f, 6),
                c(8f, 74f, 24f, 22f, 6), c(68f, 74f, 24f, 22f, 6),
                c(10f, 20f, 80f, 70f, 3), d(36f, 40f, 28f, 28f, 8),
            ),
            "たこ" to listOf(
                p(8f, 52f, 15f, 44f, 0), p(29f, 58f, 15f, 40f, 0),
                p(56f, 58f, 15f, 40f, 0), p(77f, 52f, 15f, 44f, 0),
                c(12f, 4f, 76f, 62f, 0), c(28f, 26f, 14f, 14f, 8), c(58f, 26f, 14f, 14f, 8),
                c(32f, 30f, 7f, 7f, 7), c(62f, 30f, 7f, 7f, 7),
            ),
            "くじら" to listOf(
                t(74f, 20f, 28f, 34f, 4, 34f), c(2f, 30f, 78f, 54f, 4),
                p(28f, 2f, 8f, 26f, 8), c(22f, 0f, 20f, 14f, 8), c(20f, 46f, 10f, 10f, 7),
            ),
            "ペンギン" to listOf(
                c(0f, 30f, 22f, 44f, 7), c(78f, 30f, 22f, 44f, 7),
                p(20f, 86f, 22f, 12f, 2), p(58f, 86f, 22f, 12f, 2),
                c(14f, 2f, 72f, 92f, 7), c(26f, 28f, 48f, 64f, 8),
                c(35f, 18f, 9f, 9f, 8), c(56f, 18f, 9f, 9f, 8), t(44f, 28f, 12f, 13f, 2, 180f),
            ),
            "かに" to listOf(
                c(0f, 22f, 26f, 26f, 0), c(74f, 22f, 26f, 26f, 0),
                p(4f, 62f, 24f, 9f, 0, 22f), p(72f, 62f, 24f, 9f, 0, -22f),
                c(16f, 34f, 68f, 46f, 0), c(30f, 24f, 14f, 14f, 8), c(56f, 24f, 14f, 14f, 8),
                c(34f, 28f, 7f, 7f, 7), c(60f, 28f, 7f, 7f, 7),
            ),
            "てんとうむし" to listOf(
                c(32f, 0f, 36f, 30f, 7), c(8f, 16f, 84f, 80f, 0), p(47f, 26f, 6f, 68f, 7),
                c(19f, 40f, 16f, 16f, 7), c(65f, 40f, 16f, 16f, 7),
                c(25f, 66f, 14f, 14f, 7), c(61f, 66f, 14f, 14f, 7),
            ),
            "ふくろう" to listOf(
                t(10f, 0f, 26f, 24f, 6), t(64f, 0f, 26f, 24f, 6), c(8f, 12f, 84f, 84f, 6),
                c(19f, 28f, 28f, 28f, 8), c(53f, 28f, 28f, 28f, 8),
                c(27f, 36f, 12f, 12f, 7), c(61f, 36f, 12f, 12f, 7), t(44f, 52f, 12f, 14f, 2, 180f),
            ),
            "いるか" to listOf(
                t(74f, 26f, 26f, 30f, 4, 40f), t(32f, 6f, 26f, 28f, 4, 18f),
                c(4f, 30f, 74f, 48f, 4), p(0f, 50f, 24f, 13f, 4, -8f), c(20f, 44f, 9f, 9f, 7),
            ),
            "くらげ" to listOf(
                p(22f, 52f, 9f, 44f, 5), p(38f, 56f, 9f, 42f, 5),
                p(54f, 56f, 9f, 42f, 5), p(70f, 52f, 9f, 44f, 5),
                c(12f, 6f, 76f, 62f, 5), c(31f, 28f, 11f, 11f, 8), c(58f, 28f, 11f, 11f, 8),
            ),
            "ヒトデ" to listOf(st(2f, 2f, 96f, 96f, 0), c(40f, 40f, 20f, 20f, 2)),
            "あひる" to listOf(
                t(62f, 38f, 24f, 26f, 2, 40f), c(6f, 40f, 70f, 52f, 2),
                c(46f, 8f, 40f, 40f, 2), p(78f, 22f, 22f, 13f, 1), c(58f, 20f, 9f, 9f, 7),
            ),
            "にわとり" to listOf(
                c(36f, 0f, 14f, 14f, 0), c(50f, 2f, 14f, 14f, 0),
                p(24f, 86f, 8f, 14f, 2), p(48f, 86f, 8f, 14f, 2),
                c(6f, 34f, 70f, 58f, 8), c(40f, 10f, 38f, 38f, 8),
                t(74f, 24f, 16f, 14f, 2, 90f), c(52f, 22f, 9f, 9f, 7),
            ),
            "はち" to listOf(
                c(12f, 4f, 34f, 30f, 8), c(54f, 4f, 34f, 30f, 8), c(14f, 26f, 72f, 66f, 2),
                p(20f, 44f, 60f, 10f, 7), p(24f, 62f, 52f, 10f, 7),
                c(31f, 33f, 8f, 8f, 7), c(60f, 33f, 8f, 8f, 7),
            ),
            "とんぼ" to listOf(
                p(2f, 22f, 44f, 12f, 8, -14f), p(54f, 22f, 44f, 12f, 8, 14f),
                p(4f, 40f, 40f, 10f, 8, 12f), p(56f, 40f, 40f, 10f, 8, -12f),
                p(44f, 12f, 12f, 84f, 3), c(38f, 0f, 24f, 24f, 3),
                c(40f, 6f, 8f, 8f, 7), c(52f, 6f, 8f, 8f, 7),
            ),
        ),

        CAT_NATURE to listOf(
            "き" to listOf(p(43f, 46f, 14f, 50f, 6), c(12f, 2f, 76f, 66f, 3)),
            "おやま" to listOf(t(0f, 16f, 100f, 78f, 4), t(30f, 16f, 40f, 30f, 8)),
            "たいよう" to listOf(ring(0f, 0f, 100f, 100f, 2), c(22f, 22f, 56f, 56f, 2)),
            "くも" to listOf(
                c(4f, 36f, 42f, 42f, 8), c(28f, 16f, 48f, 48f, 8), c(56f, 34f, 40f, 40f, 8),
            ),
            "おつきさま" to listOf(cres(12f, 8f, 76f, 80f, 2)),
            "はっぱ" to listOf(lf(14f, 14f, 72f, 72f, 3)),
        ),

        CAT_MAGIC to listOf(
            "きらきら" to listOf(d(36f, 2f, 28f, 46f, 2), d(2f, 36f, 46f, 28f, 2)),
            "まほうのつえ" to listOf(p(46f, 24f, 8f, 72f, 6, 16f), st(26f, 0f, 50f, 46f, 2)),
            "おしろ" to listOf(
                t(2f, 8f, 30f, 34f, 5), t(66f, 8f, 30f, 34f, 5),
                s(6f, 38f, 88f, 56f, 5), s(40f, 60f, 20f, 34f, 2),
            ),
            "ロケット" to listOf(
                t(18f, 58f, 22f, 34f, 0), t(58f, 58f, 22f, 34f, 0),
                p(34f, 2f, 32f, 74f, 8), c(41f, 18f, 18f, 18f, 4),
            ),
            "まほうのたま" to listOf(c(14f, 14f, 72f, 72f, 5), c(30f, 26f, 20f, 20f, 8)),
            "とびら" to listOf(s(18f, 6f, 64f, 88f, 6), c(66f, 46f, 10f, 10f, 2)),
        ),
    )

    /** All parts, in catalog order. */
    val all: List<Part> = raw.entries.flatMap { (category, entries) ->
        entries.map { (name, layers) ->
            Part(
                id = PartId("$category:$name"),
                nameKey = name,
                category = category,
                def = PartDef.Primitives(layers),
            )
        }
    }

    private val byId: Map<PartId, Part> = all.associateBy { it.id }

    fun find(id: PartId): Part? = byId[id]

    fun inCategory(category: String): List<Part> = all.filter { it.category == category }

    /** Lookup by bare name, for template seeds that reference parts without a category. */
    fun byName(name: String): Part? = all.firstOrNull { it.nameKey == name }
}
