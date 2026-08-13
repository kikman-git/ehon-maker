package app.ehon.store

import app.ehon.model.Book
import kotlinx.serialization.json.Json

/**
 * Serialises a [Book] for local storage, the `.ehon` archive, and Firestore.
 *
 * JSON rather than CBOR for v1: a book is ~150KB either way after stroke simplification,
 * and a readable file is worth far more when a parent emails you a broken book. Swap the
 * format behind this object if size ever bites.
 */
object BookCodec {

    const val ARCHIVE_EXTENSION = "ehon"

    /** Bumped whenever the on-disk shape changes; [decode] refuses anything newer. */
    const val FORMAT_VERSION = 1

    private val json = Json {
        // A file written by a newer build must not hard-fail an older one on a field it
        // simply does not know about.
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    fun encode(book: Book): String = json.encodeToString(Envelope(FORMAT_VERSION, book))

    /** @throws IllegalArgumentException if the payload is malformed or from a newer format. */
    fun decode(text: String): Book {
        val envelope = json.decodeFromString<Envelope>(text)
        require(envelope.version <= FORMAT_VERSION) {
            "book was written by a newer version of the app (format ${envelope.version})"
        }
        return envelope.book
    }

    fun decodeOrNull(text: String): Book? = runCatching { decode(text) }.getOrNull()

    @kotlinx.serialization.Serializable
    private data class Envelope(val version: Int, val book: Book)
}
