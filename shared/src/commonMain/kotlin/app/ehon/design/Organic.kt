package app.ehon.design

/**
 * The Organic design system's tokens, as consumed by the scene graph and both painters.
 * Values mirror `_ds/organic/styles.css`; treat that stylesheet as the source of truth
 * and this file as its port.
 */
object Organic {
    val bg = Argb.hex("f5ead8")
    val surface = Argb.hex("f9f4ed")
    val surfaceSunken = Argb.hex("ebddc5")
    val surfaceEdge = Argb.hex("dcd3c4")
    val text = Argb.hex("201e1d")
    val textMuted = Argb.hex("645c50")
    val textSubtle = Argb.hex("474238")
    val ink = Argb.hex("2e2b25")

    val accent = Argb.hex("c67139")
    val accentDeep = Argb.hex("8c491a")
    val accentTint = Argb.hex("ffe1d0")
    val accent2 = Argb.hex("7a8a5e")
    val accent2Tint = Argb.hex("e1eecc")
    val accent2Deep = Argb.hex("56633f")

    /** Page background swatches offered in the はる drawer. Solid colours, not artwork. */
    val pageBackgrounds = listOf(
        Argb.hex("f9f4ed"),
        Argb.hex("f0fae1"),
        Argb.hex("ffe1d0"),
        Argb.hex("e1eecc"),
        Argb.hex("dcd3c4"),
        Argb.hex("2e2b25"),
    )

    object Radius {
        const val SM = 8f
        const val MD = 16f
        const val LG = 28f
        const val PILL = 999f
    }

    /**
     * The nine crayons. Colours are an *index* in the document model, never a hex,
     * which is what leaves recolouring latent in the data even though the shipped
     * parts are raster.
     */
    val crayons: List<Argb> = listOf(
        Argb.oklch(0.60f, 0.16f, 28f),   // 0 red
        Argb.hex("c67139"),              // 1 terracotta
        Argb.oklch(0.78f, 0.13f, 85f),   // 2 yellow
        Argb.hex("7a8a5e"),              // 3 sage
        Argb.oklch(0.60f, 0.10f, 200f),  // 4 blue
        Argb.oklch(0.58f, 0.11f, 300f),  // 5 violet
        Argb.hex("8c491a"),              // 6 brown
        Argb.hex("2e2b25"),              // 7 ink
        Argb.hex("f9f4ed"),              // 8 cream
    )

    /** Text colours offered in the もじ drawer. */
    val textColors: List<Argb> = listOf(
        Argb.hex("2e2b25"),
        Argb.hex("c67139"),
        Argb.hex("7a8a5e"),
        Argb.oklch(0.60f, 0.16f, 28f),
        Argb.oklch(0.58f, 0.11f, 300f),
    )

    /** Index 8 is the page ground colour, so it needs a hairline to read at all. */
    const val CREAM_CRAYON = 8
    val hairline = Argb.hex("201e1d").withAlpha(0.16f)

    // Indexed accessors, for Swift.
    //
    // A `List<Argb>` crosses the Obj-C boundary as `NSArray<id>` — Swift sees `[Any]` —
    // because Argb is an inline value class and its erasure to Int32 does not survive
    // inside a generic. A *function* returning Argb erases as intended, so these keep the
    // Swift surface typed without boxing a colour per lookup.

    fun crayon(index: Int): Argb = crayons[index]

    fun textColor(index: Int): Argb = textColors[index]

    fun pageBackground(index: Int): Argb = pageBackgrounds[index]

    val crayonCount: Int get() = crayons.size

    val pageBackgroundCount: Int get() = pageBackgrounds.size
}
