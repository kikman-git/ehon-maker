package app.ehon.design

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.int
import kotlin.jvm.JvmInline
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sin

/** Packed 0xAARRGGBB. Both CoreGraphics and Compose consume this directly. */
@Serializable
@JvmInline
value class Argb(val packed: Int) {
    val a get() = (packed ushr 24) and 0xFF
    val r get() = (packed ushr 16) and 0xFF
    val g get() = (packed ushr 8) and 0xFF
    val b get() = packed and 0xFF

    fun withAlpha(alpha: Float) =
        Argb((packed and 0x00FFFFFF) or (((alpha * 255f).roundToInt().coerceIn(0, 255)) shl 24))

    override fun toString() = "#" + packed.toUInt().toString(16).padStart(8, '0')

    companion object {
        /** `#rgb` and `#rrggbb` are opaque; eight digits are `aarrggbb`, as [toString] writes. */
        fun hex(rgb: String): Argb {
            val raw = rgb.trim().removePrefix("#")
            val s = if (raw.length == 3) raw.map { "$it$it" }.joinToString("") else raw
            require(s.length == 6 || s.length == 8) { "not a colour: '$rgb'" }
            val v = s.toLong(16).toInt()
            return if (s.length == 6) Argb(v or (0xFF shl 24)) else Argb(v)
        }

        /**
         * Oklch to sRGB. The Organic design system generates its 100-900 ramps in
         * OKLCH on a shared perceptual lightness scale, and four of the nine crayons
         * are specified that way, so the conversion belongs in the core rather than
         * being pre-baked into hex by hand.
         *
         * @param l perceptual lightness, 0..1
         * @param c chroma
         * @param h hue in degrees
         */
        fun oklch(l: Float, c: Float, h: Float): Argb {
            val hr = h * PI.toFloat() / 180f
            return oklab(l, c * cos(hr), c * sin(hr))
        }

        fun oklab(l: Float, a: Float, b: Float): Argb {
            val lp = l + 0.3963377774f * a + 0.2158037573f * b
            val mp = l - 0.1055613458f * a - 0.0638541728f * b
            val sp = l - 0.0894841775f * a - 1.2914855480f * b

            val lc = lp * lp * lp
            val mc = mp * mp * mp
            val sc = sp * sp * sp

            val rLin = 4.0767416621f * lc - 3.3077115913f * mc + 0.2309699292f * sc
            val gLin = -1.2684380046f * lc + 2.6097574011f * mc - 0.3413193965f * sc
            val bLin = -0.0041960863f * lc - 0.7034186147f * mc + 1.7076147010f * sc

            return Argb(
                (0xFF shl 24) or
                    (encode(rLin) shl 16) or
                    (encode(gLin) shl 8) or
                    encode(bLin)
            )
        }

        private fun encode(linear: Float): Int {
            val c = linear.coerceIn(0f, 1f)
            val srgb = if (c <= 0.0031308f) 12.92f * c else 1.055f * c.pow(1f / 2.4f) - 0.055f
            return (srgb * 255f).roundToInt().coerceIn(0, 255)
        }
    }
}

/**
 * Packed int on the wire, as every existing book has it, but a document written by hand or by a
 * model may say `"#f9f4ed"` instead.
 */
object ArgbSerializer : KSerializer<Argb> {
    override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("app.ehon.design.Argb", PrimitiveKind.INT)

    override fun serialize(encoder: Encoder, value: Argb) = encoder.encodeInt(value.packed)

    override fun deserialize(decoder: Decoder): Argb {
        val json = decoder as? JsonDecoder ?: return Argb(decoder.decodeInt())
        val primitive = json.decodeJsonElement() as? JsonPrimitive
            ?: throw SerializationException("a colour is a number or a hex string")
        return if (primitive.isString) Argb.hex(primitive.content) else Argb(primitive.int)
    }
}
