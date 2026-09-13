package app.ehon.vector

import app.ehon.design.Argb
import app.ehon.design.Organic
import app.ehon.geom.Rect
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.acos
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Parses the SVG subset a book's [app.ehon.model.Artwork] may use into flat [VectorLayer]s.
 *
 * Supported: `svg`, `g`, `defs`, `style`; `path`, `rect`, `circle`, `ellipse`, `line`, `polyline`,
 * `polygon`; `fill`, `stroke`, `stroke-width`, `stroke-linecap`, `stroke-linejoin`, `fill-rule`,
 * `opacity`, `fill-opacity`, `stroke-opacity`, `transform`, `class` and `style`; colours as hex,
 * `rgb()`/`rgba()`, `hsl()`, CSS names, `none` and `currentColor`; a gradient fill paints the
 * average of its stops. Anything else is skipped and named in [VectorArt.unsupported], so a
 * validator can tell the author. Malformed markup throws [IllegalArgumentException], which makes
 * the codec refuse the document rather than open a book with a hole in it.
 */
object SvgParser {
    private const val MAX_ELEMENTS = 4_000
    private const val MAX_COMMANDS = 60_000
    private const val CACHE_LIMIT = 256
    private const val KAPPA = 0.5522847498f

    private val cache = HashMap<String, VectorArt>()

    /** Parsed art keyed by its source text; the same string paints on many pages and thumbnails. */
    fun cached(svg: String): VectorArt = cache[svg] ?: parse(svg).also {
        if (cache.size >= CACHE_LIMIT) cache.clear()
        cache[svg] = it
    }

    fun parse(svg: String): VectorArt {
        val root = XmlReader(svg).document()
        require(root.name == "svg") { "svg: root element is <${root.name}>, not <svg>" }
        val viewBox = viewBox(root)
        val state = ParseState()
        state.collectDefinitions(root)
        state.walk(root, Style.INITIAL, Affine.IDENTITY)
        return VectorArt(viewBox, state.layers, state.unsupported.toList())
    }

    // ── document walk ────────────────────────────────────────────────────────

    private class ParseState {
        val layers = mutableListOf<VectorLayer>()
        val unsupported = LinkedHashSet<String>()
        val gradients = HashMap<String, Element>()
        val classes = HashMap<String, Map<String, String>>()
        var commands = 0

        fun collectDefinitions(element: Element) {
            when (element.name) {
                "linearGradient", "radialGradient" -> element.attrs["id"]?.let { gradients[it] = element }
                "style" -> parseStyleSheet(element.text.toString(), classes)
            }
            element.children.forEach { collectDefinitions(it) }
        }

        fun walk(element: Element, inherited: Style, parentTransform: Affine) {
            val props = element.properties(classes)
            if (props["display"] == "none" || props["visibility"] == "hidden") return
            val style = inherited.apply(props, this)
            val transform = parentTransform * parseTransform(props["transform"])
            when (element.name) {
                "svg", "g", "a" -> element.children.forEach { walk(it, style, transform) }
                "defs", "style", "title", "desc", "metadata", "linearGradient", "radialGradient", "stop" -> Unit
                "path" -> emit(PathData.parse(element.attrs["d"] ?: ""), style, transform)
                "rect" -> emit(rect(element), style, transform)
                "circle" -> emit(ellipse(element.number("cx"), element.number("cy"), element.number("r"), element.number("r")), style, transform)
                "ellipse" -> emit(ellipse(element.number("cx"), element.number("cy"), element.number("rx"), element.number("ry")), style, transform)
                "line" -> emit(
                    listOf(PathCommand.MoveTo(element.number("x1"), element.number("y1")), PathCommand.LineTo(element.number("x2"), element.number("y2"))),
                    style.copy(fill = null), transform,
                )
                "polyline" -> emit(polyline(element.attrs["points"] ?: "", close = false), style, transform)
                "polygon" -> emit(polyline(element.attrs["points"] ?: "", close = true), style, transform)
                else -> unsupported += "<${element.name}>"
            }
        }

        private fun emit(local: List<PathCommand>, style: Style, transform: Affine) {
            if (local.isEmpty()) return
            commands += local.size
            require(commands <= MAX_COMMANDS) { "svg: more than $MAX_COMMANDS path commands" }
            val fill = style.fill?.times(style.opacity * style.fillOpacity)
            val stroke = style.stroke?.times(style.opacity * style.strokeOpacity)
            val width = if (stroke == null) 0f else style.strokeWidth * transform.scale
            if (fill == null && width <= 0f) return
            layers += VectorLayer(
                commands = local.map { it.transformed(transform) },
                fill = fill ?: Argb(0),
                hasFill = fill != null,
                stroke = stroke ?: Argb(0),
                strokeWidth = width,
                evenOdd = style.evenOdd,
                lineCap = style.lineCap,
                lineJoin = style.lineJoin,
            )
        }

        /** `url(#id)` on a gradient paints one flat colour: the mean of its stops. */
        fun gradientColor(id: String, depth: Int = 0): Argb? {
            val gradient = gradients[id] ?: return null
            val stops = gradient.children.filter { it.name == "stop" }
            if (stops.isEmpty()) {
                val href = (gradient.attrs["href"] ?: gradient.attrs["xlink:href"])?.removePrefix("#")
                return if (href != null && depth < 4) gradientColor(href, depth + 1) else null
            }
            var r = 0f; var g = 0f; var b = 0f; var a = 0f
            var counted = 0
            stops.forEach { stop ->
                val props = stop.properties(classes)
                val color = parseColor(props["stop-color"] ?: "black", this) ?: return@forEach
                val opacity = props["stop-opacity"]?.let(::parseNumber) ?: 1f
                r += color.r; g += color.g; b += color.b; a += color.a * opacity.coerceIn(0f, 1f)
                counted++
            }
            if (counted == 0) return null
            return Argb(
                ((a / counted).roundToInt().coerceIn(0, 255) shl 24) or
                    ((r / counted).roundToInt().coerceIn(0, 255) shl 16) or
                    ((g / counted).roundToInt().coerceIn(0, 255) shl 8) or
                    (b / counted).roundToInt().coerceIn(0, 255),
            )
        }
    }

    private data class Style(
        val fill: Argb?,
        val stroke: Argb?,
        val strokeWidth: Float,
        val opacity: Float,
        val fillOpacity: Float,
        val strokeOpacity: Float,
        val evenOdd: Boolean,
        val lineCap: LineCap,
        val lineJoin: LineJoin,
    ) {
        fun apply(props: Map<String, String>, state: ParseState): Style = copy(
            fill = if ("fill" in props) parseColor(props.getValue("fill"), state) else fill,
            stroke = if ("stroke" in props) parseColor(props.getValue("stroke"), state) else stroke,
            strokeWidth = props["stroke-width"]?.let(::parseNumber) ?: strokeWidth,
            // Group opacity is not inherited in SVG, but the group is painted as one; multiplying
            // through is the closest a flat layer list can get.
            opacity = opacity * (props["opacity"]?.let(::parseNumber)?.coerceIn(0f, 1f) ?: 1f),
            fillOpacity = props["fill-opacity"]?.let(::parseNumber)?.coerceIn(0f, 1f) ?: fillOpacity,
            strokeOpacity = props["stroke-opacity"]?.let(::parseNumber)?.coerceIn(0f, 1f) ?: strokeOpacity,
            evenOdd = when (props["fill-rule"]) { "evenodd" -> true; "nonzero" -> false; else -> evenOdd },
            lineCap = when (props["stroke-linecap"]) { "round" -> LineCap.ROUND; "square" -> LineCap.SQUARE; "butt" -> LineCap.BUTT; else -> lineCap },
            lineJoin = when (props["stroke-linejoin"]) { "round" -> LineJoin.ROUND; "bevel" -> LineJoin.BEVEL; "miter" -> LineJoin.MITER; else -> lineJoin },
        )

        companion object {
            val INITIAL = Style(Argb.hex("000000"), null, 1f, 1f, 1f, 1f, false, LineCap.BUTT, LineJoin.MITER)
        }
    }

    private fun Argb.times(alpha: Float): Argb = withAlpha(a / 255f * alpha.coerceIn(0f, 1f))

    /** Presentation attributes, then class rules, then the style attribute: CSS precedence. */
    private fun Element.properties(classes: Map<String, Map<String, String>>): Map<String, String> {
        val props = HashMap<String, String>()
        attrs.forEach { (key, value) -> if (key in PRESENTATION) props[key] = value.trim() }
        attrs["class"]?.split(' ')?.forEach { name -> classes[name.trim()]?.let(props::putAll) }
        attrs["style"]?.let { props.putAll(parseDeclarations(it)) }
        return props
    }

    private val PRESENTATION = setOf(
        "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "fill-rule",
        "opacity", "fill-opacity", "stroke-opacity", "transform", "display", "visibility",
        "stop-color", "stop-opacity",
    )

    private fun parseDeclarations(css: String): Map<String, String> = css.split(';')
        .mapNotNull { declaration ->
            val colon = declaration.indexOf(':')
            if (colon < 0) null else declaration.substring(0, colon).trim() to declaration.substring(colon + 1).trim()
        }
        .filter { (key, value) -> key.isNotEmpty() && value.isNotEmpty() }
        .toMap()

    /** `.name{…}` rules only; selectors with anything else are ignored. */
    private fun parseStyleSheet(css: String, into: MutableMap<String, Map<String, String>>) {
        var i = 0
        while (true) {
            val open = css.indexOf('{', i)
            if (open < 0) return
            val close = css.indexOf('}', open)
            if (close < 0) return
            val declarations = parseDeclarations(css.substring(open + 1, close))
            css.substring(i, open).split(',').map { it.trim() }.forEach { selector ->
                if (selector.startsWith(".") && selector.length > 1 && selector.drop(1).all { it.isLetterOrDigit() || it == '-' || it == '_' }) {
                    into[selector.drop(1)] = into[selector.drop(1)].orEmpty() + declarations
                }
            }
            i = close + 1
        }
    }

    // ── geometry ─────────────────────────────────────────────────────────────

    private fun viewBox(root: Element): Rect {
        val box = root.attrs["viewBox"]?.let { PathData.numbers(it) }
        if (box != null && box.size == 4 && box[2] > 0f && box[3] > 0f) return Rect(box[0], box[1], box[2], box[3])
        val w = root.attrs["width"]?.let(::parseNumber) ?: 100f
        val h = root.attrs["height"]?.let(::parseNumber) ?: 100f
        require(w > 0f && h > 0f) { "svg: viewBox or width/height must be positive" }
        return Rect(0f, 0f, w, h)
    }

    private fun Element.number(name: String) = attrs[name]?.let(::parseNumber) ?: 0f

    private fun rect(element: Element): List<PathCommand> {
        val x = element.number("x")
        val y = element.number("y")
        val w = element.number("width")
        val h = element.number("height")
        if (w <= 0f || h <= 0f) return emptyList()
        var rx = element.attrs["rx"]?.let(::parseNumber)
        var ry = element.attrs["ry"]?.let(::parseNumber)
        if (rx == null) rx = ry ?: 0f
        if (ry == null) ry = rx
        rx = rx.coerceIn(0f, w / 2f)
        ry = ry.coerceIn(0f, h / 2f)
        if (rx == 0f || ry == 0f) {
            return listOf(
                PathCommand.MoveTo(x, y), PathCommand.LineTo(x + w, y), PathCommand.LineTo(x + w, y + h),
                PathCommand.LineTo(x, y + h), PathCommand.Close,
            )
        }
        val kx = rx * KAPPA
        val ky = ry * KAPPA
        return listOf(
            PathCommand.MoveTo(x + rx, y),
            PathCommand.LineTo(x + w - rx, y),
            PathCommand.CubicTo(x + w - rx + kx, y, x + w, y + ry - ky, x + w, y + ry),
            PathCommand.LineTo(x + w, y + h - ry),
            PathCommand.CubicTo(x + w, y + h - ry + ky, x + w - rx + kx, y + h, x + w - rx, y + h),
            PathCommand.LineTo(x + rx, y + h),
            PathCommand.CubicTo(x + rx - kx, y + h, x, y + h - ry + ky, x, y + h - ry),
            PathCommand.LineTo(x, y + ry),
            PathCommand.CubicTo(x, y + ry - ky, x + rx - kx, y, x + rx, y),
            PathCommand.Close,
        )
    }

    private fun ellipse(cx: Float, cy: Float, rx: Float, ry: Float): List<PathCommand> {
        if (rx <= 0f || ry <= 0f) return emptyList()
        val kx = rx * KAPPA
        val ky = ry * KAPPA
        return listOf(
            PathCommand.MoveTo(cx + rx, cy),
            PathCommand.CubicTo(cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry),
            PathCommand.CubicTo(cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy),
            PathCommand.CubicTo(cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry),
            PathCommand.CubicTo(cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy),
            PathCommand.Close,
        )
    }

    private fun polyline(points: String, close: Boolean): List<PathCommand> {
        val numbers = PathData.numbers(points)
        if (numbers.size < 4) return emptyList()
        val commands = mutableListOf<PathCommand>(PathCommand.MoveTo(numbers[0], numbers[1]))
        var i = 2
        while (i + 1 < numbers.size) {
            commands += PathCommand.LineTo(numbers[i], numbers[i + 1])
            i += 2
        }
        if (close) commands += PathCommand.Close
        return commands
    }

    // ── attribute values ─────────────────────────────────────────────────────

    internal fun parseNumber(text: String): Float {
        val trimmed = text.trim().removeSuffix("px").removeSuffix("pt").trim()
        if (trimmed.endsWith("%")) return (trimmed.dropLast(1).trim().toFloatOrNull() ?: 0f) / 100f
        return trimmed.toFloatOrNull() ?: 0f
    }

    internal fun parseTransform(text: String?): Affine {
        if (text.isNullOrBlank()) return Affine.IDENTITY
        var result = Affine.IDENTITY
        var i = 0
        while (i < text.length) {
            val open = text.indexOf('(', i)
            if (open < 0) break
            val close = text.indexOf(')', open)
            require(close > open) { "svg: unterminated transform" }
            val name = text.substring(i, open).trim(' ', ',', '\n', '\t', '\r')
            val v = PathData.numbers(text.substring(open + 1, close))
            result *= when (name) {
                "matrix" -> if (v.size == 6) Affine(v[0], v[1], v[2], v[3], v[4], v[5]) else Affine.IDENTITY
                "translate" -> Affine.translate(v.getOrElse(0) { 0f }, v.getOrElse(1) { 0f })
                "scale" -> Affine.scale(v.getOrElse(0) { 1f }, v.getOrElse(1) { v.getOrElse(0) { 1f } })
                "rotate" -> Affine.rotate(v.getOrElse(0) { 0f }, v.getOrElse(1) { 0f }, v.getOrElse(2) { 0f })
                "skewX" -> Affine.skewX(v.getOrElse(0) { 0f })
                "skewY" -> Affine.skewY(v.getOrElse(0) { 0f })
                else -> throw IllegalArgumentException("svg: unknown transform '$name'")
            }
            i = close + 1
        }
        return result
    }

    /** Null means `none`: nothing to paint. */
    private fun parseColor(raw: String, state: ParseState): Argb? {
        val value = raw.trim()
        val lower = value.lowercase()
        return when {
            lower.isEmpty() || lower == "none" || lower == "transparent" -> null
            lower == "currentcolor" -> Organic.ink
            lower.startsWith("url(") -> {
                val id = value.substringAfter('#', "").substringBefore(')').trim()
                state.gradientColor(id) ?: run { state.unsupported += "fill:url(#$id)"; null }
            }
            lower.startsWith("#") -> hexColor(lower.drop(1)) ?: run { state.unsupported += "color:$value"; null }
            lower.startsWith("rgb") -> functionalColor(lower) ?: run { state.unsupported += "color:$value"; null }
            lower.startsWith("hsl") -> hslColor(lower) ?: run { state.unsupported += "color:$value"; null }
            else -> CssColors.named[lower]?.let { Argb(it or (0xFF shl 24)) } ?: run { state.unsupported += "color:$value"; null }
        }
    }

    private fun hexColor(hex: String): Argb? {
        if (!hex.all { it in '0'..'9' || it in 'a'..'f' }) return null
        val digits = when (hex.length) {
            3, 4 -> hex.map { "$it$it" }.joinToString("")
            6, 8 -> hex
            else -> return null
        }
        val rgb = digits.substring(0, 6).toInt(16)
        val alpha = if (digits.length == 8) digits.substring(6, 8).toInt(16) else 0xFF
        return Argb((alpha shl 24) or rgb)
    }

    private fun functionalColor(text: String): Argb? {
        val inner = text.substringAfter('(', "").substringBefore(')')
        val parts = inner.split(',', ' ', '/').map { it.trim() }.filter { it.isNotEmpty() }
        if (parts.size < 3) return null
        fun channel(p: String): Float? =
            if (p.endsWith("%")) p.dropLast(1).toFloatOrNull()?.times(2.55f) else p.toFloatOrNull()
        val r = channel(parts[0]) ?: return null
        val g = channel(parts[1]) ?: return null
        val b = channel(parts[2]) ?: return null
        val a = parts.getOrNull(3)?.let { p -> if (p.endsWith("%")) (p.dropLast(1).toFloatOrNull() ?: 100f) / 100f else p.toFloatOrNull() ?: 1f } ?: 1f
        return Argb(
            ((a.coerceIn(0f, 1f) * 255f).roundToInt() shl 24) or (r.roundToInt().coerceIn(0, 255) shl 16) or
                (g.roundToInt().coerceIn(0, 255) shl 8) or b.roundToInt().coerceIn(0, 255),
        )
    }

    private fun hslColor(text: String): Argb? {
        val inner = text.substringAfter('(', "").substringBefore(')')
        val parts = inner.split(',', ' ', '/').map { it.trim() }.filter { it.isNotEmpty() }
        if (parts.size < 3) return null
        val h = ((parts[0].removeSuffix("deg").toFloatOrNull() ?: return null) % 360f + 360f) % 360f
        val s = (parts[1].removeSuffix("%").toFloatOrNull() ?: return null) / 100f
        val l = (parts[2].removeSuffix("%").toFloatOrNull() ?: return null) / 100f
        val a = parts.getOrNull(3)?.let { p -> if (p.endsWith("%")) (p.dropLast(1).toFloatOrNull() ?: 100f) / 100f else p.toFloatOrNull() ?: 1f } ?: 1f
        val c = (1f - abs(2f * l - 1f)) * s
        val x = c * (1f - abs((h / 60f) % 2f - 1f))
        val m = l - c / 2f
        val (r1, g1, b1) = when {
            h < 60f -> Triple(c, x, 0f)
            h < 120f -> Triple(x, c, 0f)
            h < 180f -> Triple(0f, c, x)
            h < 240f -> Triple(0f, x, c)
            h < 300f -> Triple(x, 0f, c)
            else -> Triple(c, 0f, x)
        }
        fun byte(v: Float) = ((v + m) * 255f).roundToInt().coerceIn(0, 255)
        return Argb(((a.coerceIn(0f, 1f) * 255f).roundToInt() shl 24) or (byte(r1) shl 16) or (byte(g1) shl 8) or byte(b1))
    }

    // ── path data ────────────────────────────────────────────────────────────

    internal object PathData {
        fun numbers(text: String): List<Float> {
            val out = mutableListOf<Float>()
            val scanner = Scanner(text)
            while (true) out += scanner.number() ?: break
            return out
        }

        /** Every SVG path command, resolved to absolute [PathCommand]s; arcs become cubics. */
        fun parse(d: String): List<PathCommand> {
            val out = mutableListOf<PathCommand>()
            val scanner = Scanner(d)
            var cx = 0f; var cy = 0f
            var startX = 0f; var startY = 0f
            var lastCx = 0f; var lastCy = 0f
            var lastCommand = ' '
            var command = ' '
            while (true) {
                scanner.skipSeparators()
                if (scanner.done) break
                val c = scanner.peek()
                if (c.isLetter()) {
                    command = c
                    scanner.advance()
                } else {
                    require(command != ' ') { "svg: path data must start with a command" }
                    if (command == 'M') command = 'L' else if (command == 'm') command = 'l'
                }
                val relative = command.isLowerCase()
                fun x(v: Float) = if (relative) cx + v else v
                fun y(v: Float) = if (relative) cy + v else v
                when (command.uppercaseChar()) {
                    'M' -> {
                        val nx = x(scanner.required()); val ny = y(scanner.required())
                        out += PathCommand.MoveTo(nx, ny)
                        cx = nx; cy = ny; startX = nx; startY = ny
                    }
                    'L' -> {
                        val nx = x(scanner.required()); val ny = y(scanner.required())
                        out += PathCommand.LineTo(nx, ny)
                        cx = nx; cy = ny
                    }
                    'H' -> { val nx = x(scanner.required()); out += PathCommand.LineTo(nx, cy); cx = nx }
                    'V' -> { val ny = y(scanner.required()); out += PathCommand.LineTo(cx, ny); cy = ny }
                    'C' -> {
                        val x1 = x(scanner.required()); val y1 = y(scanner.required())
                        val x2 = x(scanner.required()); val y2 = y(scanner.required())
                        val nx = x(scanner.required()); val ny = y(scanner.required())
                        out += PathCommand.CubicTo(x1, y1, x2, y2, nx, ny)
                        lastCx = x2; lastCy = y2; cx = nx; cy = ny
                    }
                    'S' -> {
                        val reflect = lastCommand.uppercaseChar() in "CS"
                        val x1 = if (reflect) 2 * cx - lastCx else cx
                        val y1 = if (reflect) 2 * cy - lastCy else cy
                        val x2 = x(scanner.required()); val y2 = y(scanner.required())
                        val nx = x(scanner.required()); val ny = y(scanner.required())
                        out += PathCommand.CubicTo(x1, y1, x2, y2, nx, ny)
                        lastCx = x2; lastCy = y2; cx = nx; cy = ny
                    }
                    'Q' -> {
                        val x1 = x(scanner.required()); val y1 = y(scanner.required())
                        val nx = x(scanner.required()); val ny = y(scanner.required())
                        out += PathCommand.QuadTo(x1, y1, nx, ny)
                        lastCx = x1; lastCy = y1; cx = nx; cy = ny
                    }
                    'T' -> {
                        val reflect = lastCommand.uppercaseChar() in "QT"
                        val x1 = if (reflect) 2 * cx - lastCx else cx
                        val y1 = if (reflect) 2 * cy - lastCy else cy
                        val nx = x(scanner.required()); val ny = y(scanner.required())
                        out += PathCommand.QuadTo(x1, y1, nx, ny)
                        lastCx = x1; lastCy = y1; cx = nx; cy = ny
                    }
                    'A' -> {
                        val rx = scanner.required(); val ry = scanner.required()
                        val rotation = scanner.required()
                        val large = scanner.flag(); val sweep = scanner.flag()
                        val nx = x(scanner.required()); val ny = y(scanner.required())
                        out += arcToCubics(cx, cy, rx, ry, rotation, large, sweep, nx, ny)
                        cx = nx; cy = ny
                    }
                    'Z' -> {
                        out += PathCommand.Close
                        cx = startX; cy = startY
                    }
                    else -> throw IllegalArgumentException("svg: unknown path command '$command'")
                }
                lastCommand = command
                require(out.size <= MAX_COMMANDS) { "svg: more than $MAX_COMMANDS path commands" }
            }
            return out
        }

        private class Scanner(private val s: String) {
            var i = 0
            val done get() = i >= s.length
            fun peek() = s[i]
            fun advance() { i++ }

            fun skipSeparators() {
                while (i < s.length && (s[i].isWhitespace() || s[i] == ',')) i++
            }

            fun required(): Float = number() ?: throw IllegalArgumentException("svg: expected a number in path data at $i")

            /** Arc flags are single digits that may run together with the next number: `1 0 10,20` or `1010 20`. */
            fun flag(): Boolean {
                skipSeparators()
                require(i < s.length && (s[i] == '0' || s[i] == '1')) { "svg: expected an arc flag at $i" }
                return s[i++] == '1'
            }

            fun number(): Float? {
                skipSeparators()
                if (i >= s.length) return null
                val start = i
                if (s[i] == '+' || s[i] == '-') i++
                var digits = 0
                while (i < s.length && s[i].isDigit()) { i++; digits++ }
                if (i < s.length && s[i] == '.') {
                    i++
                    while (i < s.length && s[i].isDigit()) { i++; digits++ }
                }
                if (digits == 0) { i = start; return null }
                if (i < s.length && (s[i] == 'e' || s[i] == 'E')) {
                    val save = i
                    i++
                    if (i < s.length && (s[i] == '+' || s[i] == '-')) i++
                    var exponent = 0
                    while (i < s.length && s[i].isDigit()) { i++; exponent++ }
                    if (exponent == 0) i = save
                }
                return s.substring(start, i).toFloatOrNull() ?: throw IllegalArgumentException("svg: bad number '${s.substring(start, i)}'")
            }
        }

        /** SVG implementation notes F.6.5, endpoint to centre parameterisation, then ≤ 90° cubic pieces. */
        private fun arcToCubics(
            x0: Float, y0: Float, radiusX: Float, radiusY: Float, rotationDeg: Float,
            largeArc: Boolean, sweep: Boolean, x1: Float, y1: Float,
        ): List<PathCommand> {
            if (x0 == x1 && y0 == y1) return emptyList()
            var rx = abs(radiusX)
            var ry = abs(radiusY)
            if (rx == 0f || ry == 0f) return listOf(PathCommand.LineTo(x1, y1))
            val phi = rotationDeg * PI.toFloat() / 180f
            val cosPhi = cos(phi)
            val sinPhi = sin(phi)
            val dx = (x0 - x1) / 2f
            val dy = (y0 - y1) / 2f
            val x1p = cosPhi * dx + sinPhi * dy
            val y1p = -sinPhi * dx + cosPhi * dy
            val lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
            if (lambda > 1f) {
                val k = sqrt(lambda)
                rx *= k
                ry *= k
            }
            val sign = if (largeArc == sweep) -1f else 1f
            val numerator = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
            val denominator = rx * rx * y1p * y1p + ry * ry * x1p * x1p
            val coefficient = sign * sqrt((numerator / denominator).coerceAtLeast(0f))
            val cxp = coefficient * (rx * y1p / ry)
            val cyp = coefficient * -(ry * x1p / rx)
            val cx = cosPhi * cxp - sinPhi * cyp + (x0 + x1) / 2f
            val cy = sinPhi * cxp + cosPhi * cyp + (y0 + y1) / 2f
            fun angle(ux: Float, uy: Float, vx: Float, vy: Float): Float {
                val dot = ux * vx + uy * vy
                val len = sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy))
                var a = acos((dot / len).coerceIn(-1f, 1f))
                if (ux * vy - uy * vx < 0f) a = -a
                return a
            }
            val theta1 = angle(1f, 0f, (x1p - cxp) / rx, (y1p - cyp) / ry)
            var delta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
            val twoPi = 2f * PI.toFloat()
            if (!sweep && delta > 0f) delta -= twoPi
            if (sweep && delta < 0f) delta += twoPi
            val segments = ceil(abs(delta) / (PI.toFloat() / 2f) - 0.0001f).toInt().coerceAtLeast(1)
            val step = delta / segments
            val t = 4f / 3f * kotlin.math.tan(step / 4f)
            val out = mutableListOf<PathCommand>()
            var theta = theta1
            for (n in 0 until segments) {
                val cos1 = cos(theta); val sin1 = sin(theta)
                val cos2 = cos(theta + step); val sin2 = sin(theta + step)
                val p1x = cos1 - t * sin1; val p1y = sin1 + t * cos1
                val p2x = cos2 + t * sin2; val p2y = sin2 - t * cos2
                fun map(px: Float, py: Float): Pair<Float, Float> {
                    val ex = px * rx; val ey = py * ry
                    return (cosPhi * ex - sinPhi * ey + cx) to (sinPhi * ex + cosPhi * ey + cy)
                }
                val (c1x, c1y) = map(p1x, p1y)
                val (c2x, c2y) = map(p2x, p2y)
                val (ex, ey) = if (n == segments - 1) x1 to y1 else map(cos2, sin2)
                out += PathCommand.CubicTo(c1x, c1y, c2x, c2y, ex, ey)
                theta += step
            }
            return out
        }
    }

    // ── XML ──────────────────────────────────────────────────────────────────

    internal class Element(val name: String, val attrs: Map<String, String>) {
        val children = mutableListOf<Element>()
        val text = StringBuilder()
    }

    /** Just enough XML for SVG: elements, attributes, comments, CDATA, entities. No DTD expansion. */
    internal class XmlReader(private val s: String) {
        private var i = 0
        private var elements = 0

        fun document(): Element {
            val stack = ArrayDeque<Element>()
            var root: Element? = null
            while (i < s.length) {
                val open = s.indexOf('<', i)
                if (open < 0) break
                if (stack.isNotEmpty()) stack.last().text.append(s, i, open)
                i = open
                when {
                    s.startsWith("<!--", i) -> i = endOf("-->", i + 4, "comment")
                    s.startsWith("<![CDATA[", i) -> {
                        val end = endOf("]]>", i + 9, "CDATA section")
                        if (stack.isNotEmpty()) stack.last().text.append(s, i + 9, end - 3)
                        i = end
                    }
                    s.startsWith("<?", i) -> i = endOf("?>", i + 2, "processing instruction")
                    s.startsWith("<!", i) -> i = endOf(">", i + 2, "declaration")
                    s.startsWith("</", i) -> {
                        i += 2
                        val name = localName(readName())
                        skipSpace()
                        require(i < s.length && s[i] == '>') { "svg: malformed end tag </$name>" }
                        i++
                        val element = stack.removeLastOrNull() ?: throw IllegalArgumentException("svg: stray end tag </$name>")
                        require(element.name == name) { "svg: expected </${element.name}>, found </$name>" }
                        if (stack.isEmpty()) return root!!
                    }
                    else -> {
                        i++
                        val name = localName(readName())
                        val attrs = readAttributes()
                        val selfClosing = s.startsWith("/>", i)
                        i += if (selfClosing) 2 else 1
                        val element = Element(name, attrs)
                        require(++elements <= MAX_ELEMENTS) { "svg: more than $MAX_ELEMENTS elements" }
                        if (root == null) root = element else stack.last().children += element
                        if (!selfClosing) stack.addLast(element)
                        else if (stack.isEmpty()) return root
                    }
                }
            }
            throw IllegalArgumentException(if (root == null) "svg: no root element" else "svg: unterminated <${stack.lastOrNull()?.name ?: root.name}>")
        }

        private fun endOf(marker: String, from: Int, what: String): Int {
            val end = s.indexOf(marker, from)
            require(end >= 0) { "svg: unterminated $what" }
            return end + marker.length
        }

        private fun readName(): String {
            val start = i
            while (i < s.length && (s[i].isLetterOrDigit() || s[i] == ':' || s[i] == '_' || s[i] == '-' || s[i] == '.')) i++
            require(i > start) { "svg: expected a tag name at $start" }
            return s.substring(start, i)
        }

        private fun localName(qualified: String) = qualified.substringAfter(':')

        private fun readAttributes(): Map<String, String> {
            val attrs = HashMap<String, String>()
            while (true) {
                skipSpace()
                require(i < s.length) { "svg: unterminated start tag" }
                if (s[i] == '>' || s.startsWith("/>", i)) return attrs
                val name = readName()
                skipSpace()
                require(i < s.length && s[i] == '=') { "svg: attribute '$name' has no value" }
                i++
                skipSpace()
                require(i < s.length && (s[i] == '"' || s[i] == '\'')) { "svg: attribute '$name' must be quoted" }
                val quote = s[i++]
                val end = s.indexOf(quote, i)
                require(end >= 0) { "svg: unterminated value for '$name'" }
                attrs[name] = decodeEntities(s.substring(i, end))
                i = end + 1
            }
        }

        private fun skipSpace() {
            while (i < s.length && s[i].isWhitespace()) i++
        }

        private fun decodeEntities(text: String): String {
            if ('&' !in text) return text
            val out = StringBuilder()
            var k = 0
            while (k < text.length) {
                if (text[k] != '&') { out.append(text[k++]); continue }
                val end = text.indexOf(';', k)
                if (end < 0) { out.append(text, k, text.length); break }
                val entity = text.substring(k + 1, end)
                out.append(
                    when {
                        entity == "amp" -> "&"
                        entity == "lt" -> "<"
                        entity == "gt" -> ">"
                        entity == "quot" -> "\""
                        entity == "apos" -> "'"
                        entity.startsWith("#x") -> entity.drop(2).toIntOrNull(16)?.let { codePoint(it) } ?: ""
                        entity.startsWith("#") -> entity.drop(1).toIntOrNull()?.let { codePoint(it) } ?: ""
                        else -> ""
                    },
                )
                k = end + 1
            }
            return out.toString()
        }

        private fun codePoint(value: Int): String =
            if (value in 0..0xFFFF) value.toChar().toString() else ""
    }
}
