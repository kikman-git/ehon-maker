package app.ehon.painter

import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect as ComposeRect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size as ComposeSize
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.PathOperation
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke as DrawStroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.TextUnitType
import app.ehon.design.Argb
import app.ehon.design.Organic
import app.ehon.geom.Rect
import app.ehon.model.FontFace
import app.ehon.scene.Scene
import app.ehon.scene.SceneNode
import kotlin.math.min

/**
 * Walks a [Scene] onto a Compose [DrawScope].
 *
 * Deliberately thin: it contains no layout, no measurement and no decisions. Everything
 * geometric was resolved by `SceneBuilder`, which is why the iOS CoreGraphics painter can
 * be a structurally identical file and why the two cannot drift on anything but
 * rasterisation.
 */
class ScenePainter(
    private val textMeasurer: TextMeasurer,
    private val bodyFont: FontFamily,
    private val uiFont: FontFamily,
    private val imageProvider: ImageProvider,
) {

    fun DrawScope.paint(scene: Scene) {
        clipPage(scene) {
            drawRect(color = scene.background.toColor())
            scene.nodes.forEach { node -> draw(node) }
        }
    }

    private inline fun DrawScope.clipPage(scene: Scene, crossinline body: DrawScope.() -> Unit) {
        if (scene.cornerRadius <= 0f) {
            body()
            return
        }
        val rounded = Path().apply {
            addRoundRect(
                RoundRect(
                    ComposeRect(0f, 0f, scene.size.w, scene.size.h),
                    CornerRadius(scene.cornerRadius),
                ),
            )
        }
        clipPath(rounded) { body() }
    }

    private fun DrawScope.draw(node: SceneNode) {
        when (node) {
            is SceneNode.Group ->
                rotate(node.rotationDeg, Offset(node.pivot.x, node.pivot.y)) {
                    node.children.forEach { draw(it) }
                }

            is SceneNode.Ellipse -> {
                drawOval(node.fill.toColor(), node.rect.offset(), node.rect.size())
                if (node.hasHairline) {
                    drawOval(
                        Organic.hairline.toColor(), node.rect.offset(), node.rect.size(),
                        style = hairline(),
                    )
                }
            }

            is SceneNode.RoundRect -> {
                val path = roundRectPath(node.rect, node.radii)
                drawPath(path, node.fill.toColor())
                if (node.hasHairline) drawPath(path, Organic.hairline.toColor(), style = hairline())
            }

            is SceneNode.Polygon -> {
                val path = Path().apply {
                    node.points.forEachIndexed { i, p ->
                        if (i == 0) moveTo(p.x, p.y) else lineTo(p.x, p.y)
                    }
                    close()
                }
                drawPath(path, node.fill.toColor())
                if (node.hasHairline) drawPath(path, Organic.hairline.toColor(), style = hairline())
            }

            // The three former CSS radial-gradient masks. Even-odd rather than masking:
            // fewer moving parts, and it stays sharp at 300dpi.
            is SceneNode.Ring -> drawPath(ringPath(node.rect, node.innerRatio), node.fill.toColor())

            is SceneNode.Arc -> {
                clipRect(
                    node.rect.x,
                    node.rect.y,
                    node.rect.x + node.rect.w,
                    node.rect.y + node.rect.h / 2f,
                ) {
                    drawPath(ringPath(node.rect, node.innerRatio), node.fill.toColor())
                }
            }

            is SceneNode.Crescent -> {
                val body = Path().apply { addOval(ComposeRect(node.rect.offset(), node.rect.size())) }
                val cut = Path().apply {
                    addOval(
                        ComposeRect(
                            center = Offset(node.cutCentre.x, node.cutCentre.y),
                            radius = node.cutRadius,
                        ),
                    )
                }
                drawPath(Path().apply { op(body, cut, PathOperation.Difference) }, node.fill.toColor())
            }

            is SceneNode.Image ->
                imageProvider.load(node.assetName)?.let { image ->
                    translate(node.rect.x, node.rect.y) {
                        drawImage(
                            image = image,
                            dstSize = androidx.compose.ui.unit.IntSize(
                                node.rect.w.toInt(),
                                node.rect.h.toInt(),
                            ),
                        )
                    }
                }

            is SceneNode.Text -> {
                node.ruby?.let { ruby ->
                    drawString(ruby, node.rubyOrigin!!, node.rubySizePx, node.fill, node.font)
                }
                drawString(node.base, node.baseOrigin, node.baseSizePx, node.fill, node.font)
            }

            is SceneNode.StrokePath -> {
                if (node.points.isEmpty()) return
                val path = Path().apply {
                    val first = node.points.first()
                    moveTo(first.x, first.y)
                    if (node.points.size == 1) {
                        // A tap is a dot; give it a hair of length so it renders round.
                        lineTo(first.x + 0.01f, first.y)
                    } else {
                        node.points.drop(1).forEach { lineTo(it.x, it.y) }
                    }
                }
                drawPath(
                    path = path,
                    color = node.fill.toColor(),
                    style = DrawStroke(node.widthPx, cap = StrokeCap.Round, join = StrokeJoin.Round),
                    // Eraser lifts pixels rather than painting over them, so a stroke
                    // erased above a part reveals the page, not a coloured smear.
                    blendMode = if (node.erase) BlendMode.Clear else BlendMode.SrcOver,
                )
            }

            is SceneNode.SelectionRing ->
                drawRoundRect(
                    color = node.stroke.toColor(),
                    topLeft = node.rect.offset(),
                    size = node.rect.size(),
                    cornerRadius = CornerRadius(SELECTION_RADIUS),
                    style = DrawStroke(SELECTION_WIDTH),
                )
        }
    }

    private fun DrawScope.drawString(
        text: String,
        origin: app.ehon.geom.Point,
        sizePx: Float,
        fill: Argb,
        face: FontFace,
    ) {
        drawText(
            textMeasurer = textMeasurer,
            text = text,
            topLeft = Offset(origin.x, origin.y),
            style = TextStyle(
                color = fill.toColor(),
                fontSize = TextUnit(sizePx, TextUnitType.Sp),
                fontFamily = if (face == FontFace.UI) uiFont else bodyFont,
            ),
        )
    }

    private fun ringPath(rect: Rect, innerRatio: Float) = Path().apply {
        fillType = PathFillType.EvenOdd
        addOval(ComposeRect(rect.offset(), rect.size()))
        val inset = Rect(
            x = rect.centerX - rect.w * innerRatio / 2f,
            y = rect.centerY - rect.h * innerRatio / 2f,
            w = rect.w * innerRatio,
            h = rect.h * innerRatio,
        )
        addOval(ComposeRect(inset.offset(), inset.size()))
    }

    private fun roundRectPath(rect: Rect, radii: List<Float>): Path {
        val cap = min(rect.w, rect.h) / 2f
        val r = radii.map { CornerRadius(it.coerceAtMost(cap)) }
        return Path().apply {
            addRoundRect(
                RoundRect(
                    rect = ComposeRect(rect.offset(), rect.size()),
                    topLeft = r[0],
                    topRight = r[1],
                    bottomRight = r[2],
                    bottomLeft = r[3],
                ),
            )
        }
    }

    private fun hairline() = DrawStroke(HAIRLINE_WIDTH)

    private fun Rect.offset() = Offset(x, y)

    private fun Rect.size() = ComposeSize(w, h)

    private fun Argb.toColor() = Color(r, g, b, a)

    private companion object {
        const val HAIRLINE_WIDTH = 1f
        const val SELECTION_RADIUS = 6f
        const val SELECTION_WIDTH = 2f
    }
}

/** Resolves a raster part's asset name to a decoded, cached bitmap. */
fun interface ImageProvider {
    fun load(assetName: String): androidx.compose.ui.graphics.ImageBitmap?
}
