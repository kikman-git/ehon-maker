package app.ehon.store

import app.ehon.model.Book
import kotlinx.collections.immutable.persistentListOf
import kotlinx.collections.immutable.toPersistentList

/** Network-free document assembly and three-way merge shared by every sync client. */
object BookSyncCodec {
    fun metadata(book: Book): String = BookCodec.encode(book.copy(pages = persistentListOf()))

    /** Remote input is untrusted. A malformed/incomplete snapshot never replaces a local file. */
    fun assembleOrNull(metadata: String, pages: List<String>): Book? = runCatching {
        require(pages.size in 1..200)
        val meta = BookCodec.decode(metadata)
        require(meta.pages.isEmpty())
        meta.copy(pages = pages.map(BookCodec::decodePage).toPersistentList()).also(BookCodec::encode)
    }.getOrNull()

    /**
     * Clean pages follow the server; dirty pages keep local changes until their write commits.
     * Concurrent edits to one page are last-write-wins. A remote deletion keeps a dirty local
     * page, while a local deletion stays deleted. Reorders retain concurrent additions.
     */
    fun merge(local: Book, baseline: Book?, remote: Book): Book {
        require(local.id == remote.id && (baseline == null || baseline.id == local.id))
        val basePages = baseline?.pages?.associateBy { it.id }.orEmpty()
        val localPages = local.pages.associateBy { it.id }
        val remotePages = remote.pages.associateBy { it.id }
        val dirty = localPages.filter { (id, page) -> page != basePages[id] }.keys
        val deleted = basePages.keys - localPages.keys
        val localOrder = local.pages.map { it.id }
        val remoteOrder = remote.pages.map { it.id }
        val order = if (localOrder != baseline?.pages?.map { it.id }) {
            localOrder.filter { it in remotePages || it in dirty } + remoteOrder.filter { it !in localPages && it !in deleted }
        } else {
            remoteOrder.filter { it !in deleted } + localOrder.filter { it in dirty && it !in remotePages }
        }
        fun content(book: Book) = book.copy(pages = persistentListOf(), updatedAtEpochMs = 0)
        val meta = if (baseline != null && content(local) == content(baseline)) remote else local
        val pages = order.distinct().mapNotNull { id -> if (id in dirty) localPages[id] else remotePages[id] }
        // Concurrent deletions must never produce a zero-page book that cannot open.
        return meta.copy(
            pages = pages.ifEmpty { listOf(local.pages.first()) }.toPersistentList(),
            updatedAtEpochMs = maxOf(local.updatedAtEpochMs, remote.updatedAtEpochMs),
        )
    }

    /** An upload finishing late must not overwrite a newer recording (or a removed page). */
    fun replaceVoiceReference(book: Book, pageId: String, expected: String, replacement: String): Book =
        book.copy(pages = book.pages.map { page ->
            if (page.id == pageId && page.reply?.audioRef == expected) {
                page.copy(reply = page.reply.copy(audioRef = replacement))
            } else page
        }.toPersistentList())
}
