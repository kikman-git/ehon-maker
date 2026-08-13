package app.ehon.tools

import app.ehon.i18n.Strings
import java.io.File

/**
 * Writes every string the app can render in the UI font to a file, one per line.
 *
 * This is the input to the font subset step: Zen Maru Gothic ships only the glyphs these
 * strings use (decision #10). Run via `./gradlew :shared:dumpShippedText`, or `make fonts`.
 *
 * Yomogi is deliberately *not* subset — a child types arbitrary text into it.
 */
fun main(args: Array<String>) {
    val target = File(args.firstOrNull() ?: "build/shipped-text.txt")
    target.parentFile?.mkdirs()

    val text = Strings.allShippedText()
    // Digits and the punctuation that formatting introduces are not in any table.
    val extras = listOf("0123456789", "/%·—…、。！？「」（）", "abcdefghijklmnopqrstuvwxyz",
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ", ".,:;'\"!?-–—()[]&@#*+=<>")

    target.writeText((text + extras).joinToString("\n"))

    val glyphs = (text + extras).flatMap { it.toList() }.toSortedSet()
    println("wrote ${target.path}: ${text.size} strings, ${glyphs.size} distinct characters")
}
