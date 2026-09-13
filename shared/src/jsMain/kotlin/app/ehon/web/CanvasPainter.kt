package app.ehon.web

import app.ehon.design.Argb
import app.ehon.design.Organic
import app.ehon.geom.Rect
import app.ehon.model.FontFace
import app.ehon.scene.Scene
import app.ehon.scene.SceneNode
import app.ehon.vector.LineCap
import app.ehon.vector.LineJoin
import app.ehon.vector.PathCommand
import kotlinx.browser.document
import org.w3c.dom.*
import kotlin.math.PI
import kotlin.math.min

/** The browser painter only walks resolved nodes; all layout remains in SceneBuilder. */
internal class CanvasPainter(private val imageProvider: (String) -> HTMLImageElement?) {
    private var inkCanvas: HTMLCanvasElement? = null

    fun dispose() {
        inkCanvas?.let { it.width = 0; it.height = 0 }
        inkCanvas = null
    }

    fun draw(scene: Scene, ctx: CanvasRenderingContext2D) {
        // Erase only the drawing layer. Erasing the destination would punch transparent holes
        // through the paper and placed illustrations, including in the reader and exports.
        val strokes = scene.nodes.filterIsInstance<SceneNode.StrokePath>()
        val isolatedInk = if (strokes.any { it.erase }) {
            val canvas = inkCanvas ?: (document.createElement("canvas") as HTMLCanvasElement).also { inkCanvas = it }
            canvas.width = ctx.canvas.width.coerceIn(1, 4096)
            canvas.height = ctx.canvas.height.coerceIn(1, 4096)
            val ink = canvas.getContext("2d") as CanvasRenderingContext2D
            ink.scale(canvas.width / scene.size.w.toDouble(), canvas.height / scene.size.h.toDouble())
            strokes.forEach { draw(it, ink) }
            canvas
        } else null
        ctx.saved {
            val bounds = Rect(0f, 0f, scene.size.w, scene.size.h)
            roundRect(bounds, List(4) { scene.cornerRadius })
            clip()
            fillStyle = scene.background.css()
            fillRect(0.0, 0.0, scene.size.w.toDouble(), scene.size.h.toDouble())
            var inkDrawn = false
            scene.nodes.forEach {
                if (isolatedInk != null && it is SceneNode.StrokePath) {
                    if (!inkDrawn) {
                        drawImage(isolatedInk, 0.0, 0.0, scene.size.w.toDouble(), scene.size.h.toDouble())
                        inkDrawn = true
                    }
                } else draw(it, this)
            }
        }
    }

    private fun draw(node: SceneNode, ctx: CanvasRenderingContext2D) {
        with(ctx) {
            when (node) {
                is SceneNode.Group -> saved {
                    translate(node.pivot.x.toDouble(), node.pivot.y.toDouble())
                    rotate(node.rotationDeg * PI / 180.0)
                    translate(-node.pivot.x.toDouble(), -node.pivot.y.toDouble())
                    node.children.forEach { draw(it, this) }
                }
                is SceneNode.Ellipse -> {
                    beginPath()
                    oval(node.rect)
                    fillShape(node.fill, node.hasHairline)
                }
                is SceneNode.RoundRect -> {
                    roundRect(node.rect, node.radii)
                    fillShape(node.fill, node.hasHairline)
                }
                is SceneNode.Polygon -> {
                    if (node.points.isEmpty()) return
                    beginPath()
                    moveTo(node.points.first().x.toDouble(), node.points.first().y.toDouble())
                    node.points.drop(1).forEach { lineTo(it.x.toDouble(), it.y.toDouble()) }
                    closePath()
                    fillShape(node.fill, node.hasHairline)
                }
                is SceneNode.Ring -> {
                    ring(node.rect, node.innerRatio)
                    fillStyle = node.fill.css()
                    fill(CanvasFillRule.EVENODD)
                }
                is SceneNode.Arc -> saved {
                    beginPath()
                    rect(node.rect.x.toDouble(), node.rect.y.toDouble(), node.rect.w.toDouble(), node.rect.h / 2.0)
                    clip()
                    ring(node.rect, node.innerRatio)
                    fillStyle = node.fill.css()
                    fill(CanvasFillRule.EVENODD)
                }
                is SceneNode.Crescent -> saved {
                    beginPath()
                    oval(node.rect)
                    clip()
                    beginPath()
                    rect(node.rect.x.toDouble(), node.rect.y.toDouble(), node.rect.w.toDouble(), node.rect.h.toDouble())
                    val radius = node.cutRadius.toDouble()
                    moveTo(node.cutCentre.x + radius, node.cutCentre.y.toDouble())
                    arc(node.cutCentre.x.toDouble(), node.cutCentre.y.toDouble(), radius, 0.0, 2 * PI)
                    fillStyle = node.fill.css()
                    fill(CanvasFillRule.EVENODD)
                }
                is SceneNode.Path -> saved {
                    beginPath()
                    node.commands.forEach { command ->
                        when (command) {
                            is PathCommand.MoveTo -> moveTo(command.x.toDouble(), command.y.toDouble())
                            is PathCommand.LineTo -> lineTo(command.x.toDouble(), command.y.toDouble())
                            is PathCommand.QuadTo -> quadraticCurveTo(command.x1.toDouble(), command.y1.toDouble(), command.x.toDouble(), command.y.toDouble())
                            is PathCommand.CubicTo -> bezierCurveTo(
                                command.x1.toDouble(), command.y1.toDouble(), command.x2.toDouble(), command.y2.toDouble(),
                                command.x.toDouble(), command.y.toDouble(),
                            )
                            PathCommand.Close -> closePath()
                        }
                    }
                    if (node.hasFill) {
                        fillStyle = node.fill.css()
                        fill(if (node.evenOdd) CanvasFillRule.EVENODD else CanvasFillRule.NONZERO)
                    }
                    if (node.strokeWidthPx > 0f) {
                        lineWidth = node.strokeWidthPx.toDouble()
                        lineCap = when (node.lineCap) {
                            LineCap.BUTT -> CanvasLineCap.BUTT
                            LineCap.ROUND -> CanvasLineCap.ROUND
                            LineCap.SQUARE -> CanvasLineCap.SQUARE
                        }
                        lineJoin = when (node.lineJoin) {
                            LineJoin.MITER -> CanvasLineJoin.MITER
                            LineJoin.ROUND -> CanvasLineJoin.ROUND
                            LineJoin.BEVEL -> CanvasLineJoin.BEVEL
                        }
                        strokeStyle = node.stroke.css()
                        stroke()
                    }
                }
                is SceneNode.Image -> {
                    val image = imageProvider(node.assetName)
                    if (image == null) {
                        fillStyle = Organic.hairline.withAlpha(0.25f).css()
                        fillRect(node.rect.x.toDouble(), node.rect.y.toDouble(), node.rect.w.toDouble(), node.rect.h.toDouble())
                    } else {
                        drawImage(image, node.rect.x.toDouble(), node.rect.y.toDouble(), node.rect.w.toDouble(), node.rect.h.toDouble())
                    }
                }
                is SceneNode.Text -> {
                    node.ruby?.let { ruby ->
                        val origin = node.rubyOrigin!!
                        drawText(ruby, origin.x, origin.y, node.rubySizePx, node.fill, node.font)
                    }
                    drawText(node.base, node.baseOrigin.x, node.baseOrigin.y, node.baseSizePx, node.fill, node.font)
                }
                is SceneNode.StrokePath -> saved {
                    val first = node.points.firstOrNull() ?: return@saved
                    beginPath()
                    moveTo(first.x.toDouble(), first.y.toDouble())
                    if (node.points.all { it == first }) lineTo(first.x + 0.01, first.y.toDouble())
                    else node.points.drop(1).forEach { lineTo(it.x.toDouble(), it.y.toDouble()) }
                    lineCap = CanvasLineCap.ROUND
                    lineJoin = CanvasLineJoin.ROUND
                    lineWidth = node.widthPx.toDouble()
                    globalCompositeOperation = if (node.erase) "destination-out" else "source-over"
                    strokeStyle = node.fill.css()
                    stroke()
                }
                is SceneNode.SelectionRing -> saved {
                    roundRect(node.rect, List(4) { 6f })
                    lineWidth = 2.0
                    setLineDash(arrayOf(4.0, 3.0))
                    strokeStyle = node.stroke.css()
                    stroke()
                }
            }
        }
    }

    private fun CanvasRenderingContext2D.drawText(text: String, x: Float, y: Float, size: Float, color: Argb, face: FontFace) {
        font = cssFont(size.toDouble(), face.id)
        textAlign = CanvasTextAlign.LEFT
        textBaseline = CanvasTextBaseline.TOP
        fillStyle = color.css()
        fillText(text, x.toDouble(), y.toDouble())
    }

    private fun CanvasRenderingContext2D.fillShape(color: Argb, hairline: Boolean) {
        fillStyle = color.css()
        fill()
        if (hairline) {
            strokeStyle = Organic.hairline.css()
            lineWidth = 1.0
            stroke()
        }
    }

    private fun CanvasRenderingContext2D.oval(rect: Rect) {
        moveTo((rect.x + rect.w).toDouble(), rect.centerY.toDouble())
        ellipse(rect.centerX.toDouble(), rect.centerY.toDouble(), rect.w / 2.0, rect.h / 2.0, 0.0, 0.0, 2 * PI)
        closePath()
    }

    private fun CanvasRenderingContext2D.ring(rect: Rect, ratio: Float) {
        beginPath()
        oval(rect)
        oval(Rect(rect.centerX - rect.w * ratio / 2, rect.centerY - rect.h * ratio / 2, rect.w * ratio, rect.h * ratio))
    }

    private fun CanvasRenderingContext2D.roundRect(rect: Rect, radii: List<Float>) {
        val cap = min(rect.w, rect.h) / 2.0
        val r = radii.map { it.toDouble().coerceIn(0.0, cap) }
        val x = rect.x.toDouble()
        val y = rect.y.toDouble()
        val right = x + rect.w
        val bottom = y + rect.h
        beginPath()
        moveTo(x + r[0], y)
        lineTo(right - r[1], y)
        arcTo(right, y, right, y + r[1], r[1])
        lineTo(right, bottom - r[2])
        arcTo(right, bottom, right - r[2], bottom, r[2])
        lineTo(x + r[3], bottom)
        arcTo(x, bottom, x, bottom - r[3], r[3])
        lineTo(x, y + r[0])
        arcTo(x, y, x + r[0], y, r[0])
        closePath()
    }

    private inline fun CanvasRenderingContext2D.saved(block: CanvasRenderingContext2D.() -> Unit) {
        save()
        try { block() } finally { restore() }
    }
}

internal fun cssFont(size: Double, id: String) = "${size}px \"Ehon-$id\""
internal fun Argb.css() = "rgba($r,$g,$b,${a / 255.0})"
