import {
  collection, doc, getDocFromServer, getDocs, getDocsFromServer, onSnapshot, query, runTransaction, serverTimestamp, Timestamp, where, writeBatch,
  type DocumentData, type Firestore, type QuerySnapshot, type Unsubscribe,
} from 'firebase/firestore';
import { codec } from '../core';
import { sha256Hex, sleep } from './hash';

export interface Push { id: string; json: string; baseline: string | null; revision: number; deleted: boolean }
interface Lease { deviceId: string; expiresAt: Timestamp }
interface Metadata { json: string; ids: string[]; hashes: Record<string, string>; revision: number; lease: Lease | null }
type Pages = Map<string, { json: string; hash: string }>;
export interface IllustrationDoc { id: string; data: DocumentData }

export class SyncError extends Error {
  constructor(readonly kind: 'documentTooLarge' | 'invalidId') { super(kind); }
}

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const utf8Length = (text: string) => new TextEncoder().encode(text).length;
const LEASE_SECONDS = 175;

/**
 * Firebase transport only, a structural twin of the iOS SyncEngine. Kotlin owns document
 * assembly and merge; the repository owns local rows. Every async continuation re-checks the
 * epoch so a sign-out or stop() cannot let a late result touch another account's state.
 */
export class SyncEngine {
  onRemote: (json: string, revision: number) => void = () => {};
  onAcknowledged: (push: Push, revision: number) => void = () => {};
  onDeleted: (id: string, revision: number) => void = () => {};
  onError: (message: string) => void = () => {};
  onLease: (readOnly: boolean) => void = () => {};
  onEntitlement: (fields: DocumentData) => void = () => {};
  onIllustrations: (uid: string, docs: IllustrationDoc[]) => void = () => {};

  uid: string | null = null;
  readonly deviceId: string;
  activePageListeners = 0;
  private epoch = 0;
  private abort = new AbortController();
  private shelf: Unsubscribe | null = null;
  private pagesListener: Unsubscribe | null = null;
  private library: Unsubscribe | null = null;
  private entitlement: Unsubscribe | null = null;
  private heartbeat: AbortController | null = null;
  private readonly metadata = new Map<string, Metadata>();
  private readonly pages = new Map<string, Pages>();
  private readonly fetching = new Set<string>();
  private readonly queued = new Map<string, Push>();
  private readonly writers = new Set<string>();
  private readonly leaseWaiters = new Map<string, ReturnType<typeof setTimeout>>();
  private pageSequence = 0;
  private opened: string | null = null;
  private editing = false;
  private foreground = true;

  constructor(private readonly db: Firestore, deviceId?: string) {
    let saved: string | null = null;
    try { saved = localStorage.getItem('syncDeviceId'); } catch { /* storage may be blocked */ }
    if (!saved) {
      saved = crypto.randomUUID();
      try { localStorage.setItem('syncDeviceId', saved); } catch { /* per-tab identity is still valid */ }
    }
    this.deviceId = deviceId ?? saved;
  }

  start(uid: string): void {
    this.stop();
    this.uid = uid;
    const generation = this.epoch;
    const books = query(collection(this.db, 'books'), where('ownerId', '==', uid), where('deleted', '==', false));
    this.shelf = onSnapshot(books, { includeMetadataChanges: true }, (snapshot) => {
      if (this.epoch !== generation) return;
      for (const change of snapshot.docChanges({ includeMetadataChanges: true })) {
        if (change.doc.metadata.hasPendingWrites) continue;
        if (change.type === 'removed') void this.refresh(change.doc.id, generation);
        else this.receiveMetadata(change.doc.id, change.doc.data());
      }
    }, (error) => { if (this.epoch === generation) this.onError(error.message); });
    this.entitlement = onSnapshot(doc(this.db, 'entitlements', uid), (snapshot) => {
      if (this.epoch === generation) this.onEntitlement(snapshot.data() ?? {});
    }, () => {});
    const illustrations = query(collection(this.db, 'illustrations'), where('ownerId', '==', uid), where('deleted', '==', false));
    this.library = onSnapshot(illustrations, (snapshot) => {
      if (this.epoch === generation) this.onIllustrations(uid, snapshot.docs.map((item) => ({ id: item.id, data: item.data() })));
    }, () => {});
  }

  stop(): void {
    this.close();
    this.epoch++;
    this.abort.abort();
    this.abort = new AbortController();
    this.shelf?.(); this.shelf = null;
    this.library?.(); this.library = null;
    this.entitlement?.(); this.entitlement = null;
    for (const timer of this.leaseWaiters.values()) clearTimeout(timer);
    this.leaseWaiters.clear();
    this.writers.clear(); this.queued.clear(); this.metadata.clear(); this.pages.clear(); this.fetching.clear();
    this.uid = null;
  }

  enqueue(push: Push): void {
    if (!this.uid) return;
    if (!ID.test(push.id)) { this.onError('invalidId'); return; }
    this.queued.set(push.id, push);
    this.startWriter(push.id);
  }

  private startWriter(id: string): void {
    if (this.writers.has(id) || !this.uid) return;
    if (this.heldElsewhere(id)) { this.scheduleLeaseRetry(id); return; }
    const generation = this.epoch;
    const uid = this.uid;
    const signal = this.abort.signal;
    this.writers.add(id);
    void (async () => {
      let failures = 0;
      try {
        while (this.epoch === generation) {
          const push = this.queued.get(id);
          if (!push) break;
          this.queued.delete(id);
          if (this.heldElsewhere(id)) { this.queued.set(id, push); this.scheduleLeaseRetry(id); break; }
          try {
            await this.commit(push, uid);
            if (this.epoch !== generation) return;
            failures = 0;
            // A save queued during the commit carried the old revision; the repository re-derives it after the ack.
            this.queued.delete(id);
            this.onAcknowledged(push, push.revision + 1);
            if (this.opened === id && this.editing) await this.acquireLease(id, generation);
          } catch (error) {
            if (this.epoch !== generation) return;
            failures++;
            // A stale revision rejects the entire batch: pull the latest baseline, merge, retry the coalesced document.
            if (!this.queued.has(id)) this.queued.set(id, push);
            await this.refresh(id, generation);
            if (this.epoch !== generation) return;
            this.onError(error instanceof Error ? error.message : String(error));
            if (error instanceof SyncError && error.kind === 'documentTooLarge') break;
            await sleep(Math.min(60, 2 ** Math.min(failures, 6)) * 1000, signal);
          }
        }
      } finally {
        if (this.epoch === generation) this.writers.delete(id);
      }
    })();
  }

  private async commit(push: Push, uid: string): Promise<void> {
    const ids = codec.pageIds(push.json);
    const jsons = codec.pagesJson(push.json);
    const hashes: Record<string, string> = {};
    for (let index = 0; index < ids.length; index++) hashes[ids[index]] = await sha256Hex(jsons[index]);
    const meta = codec.syncMetadata(push.json);
    if (ids.length > 200 || utf8Length(meta) >= 100_000 || jsons.some((json) => utf8Length(json) >= 900_000)) throw new SyncError('documentTooLarge');
    const ref = doc(this.db, 'books', push.id);
    const fields = { ownerId: uid, meta, pageIds: ids, pageHashes: hashes, revision: push.revision + 1, updatedAt: serverTimestamp(), deleted: push.deleted };
    const batch = writeBatch(this.db);
    if (push.revision === 0) batch.set(ref, { ...fields, lease: null });
    else batch.update(ref, fields);
    if (!push.deleted) {
      const previous: Record<string, string> = {};
      if (push.baseline) {
        const baseIds = codec.pageIds(push.baseline);
        const baseJsons = codec.pagesJson(push.baseline);
        for (let index = 0; index < baseIds.length; index++) previous[baseIds[index]] = await sha256Hex(baseJsons[index]);
      }
      ids.forEach((id, index) => {
        if (previous[id] !== hashes[id]) batch.set(doc(ref, 'pages', id), { ownerId: uid, json: jsons[index], updatedAt: serverTimestamp() });
      });
    }
    await batch.commit();
  }

  open(id: string, editing: boolean): void {
    if (this.opened === id && this.editing === editing) return;
    this.close();
    if (!this.uid || !ID.test(id)) return;
    this.opened = id;
    this.editing = editing;
    const generation = this.epoch;
    this.activePageListeners++;
    console.assert(this.activePageListeners === 1, 'one page listener per open book');
    this.pagesListener = onSnapshot(collection(this.db, 'books', id, 'pages'), { includeMetadataChanges: true }, (snapshot) => {
      if (this.epoch !== generation || this.opened !== id || snapshot.metadata.hasPendingWrites) return;
      const sequence = ++this.pageSequence;
      void SyncEngine.pageJSON(snapshot).then((pages) => {
        if (this.epoch !== generation || this.opened !== id || sequence !== this.pageSequence) return;
        this.pages.set(id, pages);
        this.deliver(id);
      });
    }, () => {});
    if (editing && this.foreground) this.startHeartbeat(id, generation);
  }

  close(): void {
    const old = this.opened;
    this.opened = null;
    this.pagesListener?.(); this.pagesListener = null;
    this.activePageListeners = 0;
    this.stopHeartbeat();
    if (old && this.editing) this.releaseLease(old);
    this.editing = false;
    this.onLease(false);
  }

  setForeground(value: boolean): void {
    this.foreground = value;
    const opened = this.opened;
    if (!opened || !this.editing) return;
    this.stopHeartbeat();
    if (value) this.startHeartbeat(opened, this.epoch);
    else this.releaseLease(opened);
  }

  private startHeartbeat(id: string, generation: number): void {
    this.stopHeartbeat();
    const controller = new AbortController();
    this.heartbeat = controller;
    void (async () => {
      while (!controller.signal.aborted && this.epoch === generation && this.opened === id && this.foreground) {
        await this.acquireLease(id, generation);
        await sleep(60_000, controller.signal);
      }
    })();
  }

  private stopHeartbeat(): void {
    this.heartbeat?.abort();
    this.heartbeat = null;
  }

  private async acquireLease(id: string, generation: number): Promise<void> {
    const uid = this.uid;
    if (!uid) return;
    const device = this.deviceId;
    const ref = doc(this.db, 'books', id);
    try {
      const result = await runTransaction(this.db, async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists()) return true;
        const data = snapshot.data();
        if (data.ownerId !== uid || data.deleted !== false) return false;
        const lease = data.lease as Lease | null;
        if (lease && lease.deviceId !== device && lease.expiresAt instanceof Timestamp && lease.expiresAt.toMillis() > Date.now()) return false;
        transaction.update(ref, { lease: { deviceId: device, expiresAt: Timestamp.fromMillis(Date.now() + LEASE_SECONDS * 1000) } });
        return true;
      });
      if (!(this.epoch === generation && this.opened === id && this.editing && this.foreground)) {
        if (this.epoch === generation) this.releaseLease(id);
        return;
      }
      this.onLease(!result);
      if (result) this.startWriter(id);
    } catch {
      // Offline creation and editing remain available. A known live lease still wins.
      if (this.epoch === generation && this.opened === id) this.onLease(this.heldElsewhere(id));
    }
  }

  private releaseLease(id: string): void {
    const ref = doc(this.db, 'books', id);
    const device = this.deviceId;
    void runTransaction(this.db, async (transaction) => {
      const snapshot = await transaction.get(ref);
      if ((snapshot.data()?.lease as Lease | null)?.deviceId === device) transaction.update(ref, { lease: null });
    }).catch(() => {});
  }

  private heldElsewhere(id: string): boolean {
    const lease = this.metadata.get(id)?.lease;
    return !!lease && lease.deviceId !== this.deviceId && lease.expiresAt instanceof Timestamp && lease.expiresAt.toMillis() > Date.now();
  }

  private scheduleLeaseRetry(id: string): void {
    if (this.leaseWaiters.has(id) || !this.queued.has(id)) return;
    const generation = this.epoch;
    const expires = this.metadata.get(id)?.lease?.expiresAt.toMillis() ?? Date.now();
    const delay = Math.max(1, Math.min(180, (expires - Date.now()) / 1000 + 1)) * 1000;
    this.leaseWaiters.set(id, setTimeout(() => {
      this.leaseWaiters.delete(id);
      if (this.epoch === generation) this.startWriter(id);
    }, delay));
  }

  private receiveMetadata(id: string, data: DocumentData): void {
    const ids: unknown = data.pageIds;
    const hashes: unknown = data.pageHashes;
    if (data.ownerId !== this.uid || typeof data.revision !== 'number' || data.revision < (this.metadata.get(id)?.revision ?? 0)
      || typeof data.meta !== 'string' || !Array.isArray(ids) || !ids.every((item) => typeof item === 'string')
      || !hashes || typeof hashes !== 'object' || new Set(ids).size !== ids.length || ids.length > 200) return;
    const hashMap = hashes as Record<string, unknown>;
    if (Object.keys(hashMap).length !== ids.length || !ids.every((item) => typeof hashMap[item] === 'string')) return;
    const lease = data.lease && typeof data.lease.deviceId === 'string' && data.lease.expiresAt instanceof Timestamp ? data.lease as Lease : null;
    this.metadata.set(id, { json: data.meta, ids, hashes: hashMap as Record<string, string>, revision: data.revision, lease });
    if (this.opened === id && this.editing) this.onLease(this.heldElsewhere(id));
    if (!this.heldElsewhere(id)) this.startWriter(id);
    if (!this.deliver(id) && (this.opened !== id || !this.pages.has(id))) this.fetchPages(id);
  }

  private deliver(id: string): boolean {
    const meta = this.metadata.get(id);
    const cached = this.pages.get(id);
    if (!meta || !cached || !meta.ids.every((pageId) => cached.get(pageId)?.hash === meta.hashes[pageId])) return false;
    const json = codec.assembleOrNull(meta.json, meta.ids.map((pageId) => cached.get(pageId)!.json));
    if (!json) return false;
    let summary: { id?: unknown };
    try { summary = JSON.parse(codec.summaryJson(json)); } catch { return false; }
    if (summary.id !== id) return false;
    this.onRemote(json, meta.revision);
    return true;
  }

  private fetchPages(id: string): void {
    if (this.fetching.has(id)) return;
    this.fetching.add(id);
    const generation = this.epoch;
    const requested = this.metadata.get(id)?.revision;
    void (async () => {
      let pages: Pages | null = null;
      try {
        const snapshot = await getDocs(collection(this.db, 'books', id, 'pages'));
        if (!snapshot.metadata.hasPendingWrites) pages = await SyncEngine.pageJSON(snapshot);
      } catch { /* the durable local queue retries when connectivity returns */ }
      if (this.epoch !== generation) return;
      this.fetching.delete(id);
      if (!pages) return;
      this.pages.set(id, pages);
      if (!this.deliver(id) && requested !== this.metadata.get(id)?.revision) this.fetchPages(id);
    })();
  }

  private async refresh(id: string, generation: number): Promise<void> {
    try {
      const ref = doc(this.db, 'books', id);
      const snapshot = await getDocFromServer(ref);
      if (this.epoch !== generation) return;
      const data = snapshot.data();
      if (!data) return;
      if (data.deleted === true) {
        this.queued.delete(id);
        this.onDeleted(id, typeof data.revision === 'number' ? data.revision : 0);
        return;
      }
      const pagesSnapshot = await getDocsFromServer(collection(ref, 'pages'));
      if (this.epoch !== generation || pagesSnapshot.metadata.hasPendingWrites) return;
      const pages = await SyncEngine.pageJSON(pagesSnapshot);
      if (this.epoch !== generation) return;
      this.pages.set(id, pages);
      this.receiveMetadata(id, data);
    } catch { /* offline: the writer backs off and retries */ }
  }

  private static async pageJSON(snapshot: QuerySnapshot): Promise<Pages> {
    const pages: Pages = new Map();
    for (const item of snapshot.docs) {
      const json = item.data().json;
      if (typeof json === 'string') pages.set(item.id, { json, hash: await sha256Hex(json) });
    }
    return pages;
  }
}
