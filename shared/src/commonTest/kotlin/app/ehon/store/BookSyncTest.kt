package app.ehon.store

import app.ehon.design.Argb
import app.ehon.model.*
import kotlinx.collections.immutable.persistentListOf
import kotlin.test.*

class BookSyncTest {
    private val base = Book(BookId("b"), "Book", PageShape.SQUARE, "ja-JP",
        pages = persistentListOf(Page(Argb(0xFFFFFFFF.toInt()), id = "p1"), Page(Argb(0xFFFFFFFF.toInt()), id = "p2")), updatedAtEpochMs = 1)

    @Test fun splitRoundTripPreservesOrderAndRejectsIncompleteInput() {
        val meta = BookSyncCodec.metadata(base)
        assertEquals(base, BookSyncCodec.assembleOrNull(meta, base.pages.map(BookCodec::encodePage)))
        assertNull(BookSyncCodec.assembleOrNull(meta, emptyList()))
        assertNull(BookSyncCodec.assembleOrNull(meta, listOf("{}")))
        assertNull(BookSyncCodec.assembleOrNull(meta, listOf(BookCodec.encodePage(base.page(0)), BookCodec.encodePage(base.page(0)))))
    }

    @Test fun disjointOfflineEditsMergeWithoutLosingEitherPage() {
        val local = base.mapPage(0) { it.copy(promptKey = "local") }.copy(updatedAtEpochMs = 3)
        val remote = base.mapPage(1) { it.copy(promptKey = "remote") }.copy(title = "Remote title", updatedAtEpochMs = 4)
        val merged = BookSyncCodec.merge(local, base, remote)
        assertEquals("local", merged.page(0).promptKey)
        assertEquals("remote", merged.page(1).promptKey)
        assertEquals("Remote title", merged.title)
        assertEquals(4, merged.updatedAtEpochMs)
    }

    @Test fun dirtyPageWinsUntilAcknowledgedThenFollowsServer() {
        val local = base.mapPage(0) { it.copy(promptKey = "local") }
        val remote = base.mapPage(0) { it.copy(promptKey = "remote") }
        assertEquals(local, BookSyncCodec.merge(local, base, remote))
        assertEquals(remote, BookSyncCodec.merge(local, local, remote))
    }

    @Test fun reordersRetainRemoteAdditionsAndLocalDeletions() {
        val local = base.copy(pages = persistentListOf(base.page(1)))
        val remote = base.copy(pages = base.pages.add(Page(Argb(0), id = "p3")))
        assertEquals(listOf("p2", "p3"), BookSyncCodec.merge(local, base, remote).pages.map { it.id })
    }

    @Test fun remoteDeletionDoesNotDiscardUnsentPageEdits() {
        val remote = base.copy(pages = persistentListOf(base.page(1)))
        val local = base.mapPage(0) { it.copy(promptKey = "unsent") }
        assertEquals("unsent", BookSyncCodec.merge(local, base, remote).pages.first { it.id == "p1" }.promptKey)
        assertEquals(listOf("p2"), BookSyncCodec.merge(base, base, remote).pages.map { it.id })
    }

    @Test fun staleVoiceUploadCannotReplaceNewRecording() {
        val local = base.withReply(0, PageReply("Mama", 2f, "new.m4a"))
        assertEquals(local, BookSyncCodec.replaceVoiceReference(local, "p1", "old.m4a", "v/uid/b/r.m4a"))
        assertEquals("v/uid/b/r.m4a", BookSyncCodec.replaceVoiceReference(local, "p1", "new.m4a", "v/uid/b/r.m4a").page(0).reply?.audioRef)
    }
}
