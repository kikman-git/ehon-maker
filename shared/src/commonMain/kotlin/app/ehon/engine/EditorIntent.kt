package app.ehon.engine

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Composition vocabulary shared by UI automation and AI; no platform document mutation. */
@Serializable
sealed interface EditorIntent {
    @Serializable @SerialName("addPart")
    data class AddPart(val partId: String, val xPct: Float, val yPct: Float, val sizePct: Float = 26f, val heightPct: Float? = null) : EditorIntent
    @Serializable @SerialName("selectItem")
    data class SelectItem(val id: String) : EditorIntent
    @Serializable @SerialName("moveSelected")
    data class MoveSelected(val xPct: Float, val yPct: Float) : EditorIntent
    @Serializable @SerialName("resizeSelected")
    data class ResizeSelected(val bigger: Boolean) : EditorIntent
    @Serializable @SerialName("rotateSelected")
    data object RotateSelected : EditorIntent
    @Serializable @SerialName("deleteSelected")
    data object DeleteSelected : EditorIntent
    @Serializable @SerialName("bringForward")
    data object BringForward : EditorIntent
    @Serializable @SerialName("sendBackward")
    data object SendBackward : EditorIntent
    @Serializable @SerialName("clearSelection")
    data object ClearSelection : EditorIntent
    @Serializable @SerialName("setBackground")
    data class SetBackground(val argb: Int) : EditorIntent
    @Serializable @SerialName("setDraftText")
    data class SetDraftText(val text: String) : EditorIntent
    @Serializable @SerialName("setDraftRuby")
    data class SetDraftRuby(val ruby: String) : EditorIntent
    @Serializable @SerialName("setTextSize")
    data class SetTextSize(val step: Int) : EditorIntent
    @Serializable @SerialName("setFont")
    data class SetFont(val id: String) : EditorIntent
    @Serializable @SerialName("setTextColour")
    data class SetTextColour(val index: Int) : EditorIntent
    @Serializable @SerialName("commitText")
    data object CommitText : EditorIntent
    @Serializable @SerialName("goToPage")
    data class GoToPage(val index: Int) : EditorIntent
    @Serializable @SerialName("addPage")
    data object AddPage : EditorIntent
    @Serializable @SerialName("movePage")
    data class MovePage(val from: Int, val to: Int) : EditorIntent
}

@Serializable
data class EditorIntentBatch(val bookId: String, val revision: Int, val intents: List<EditorIntent>)
