import { codec } from '../core';
import { cloud, isDev } from './config';
import { firebase } from './firebase';
import { PartLibrary } from './library';
import { LocalBookStore, type BookRow } from './localStore';
import { session, startSession } from './session';
import { createStore } from './store';
import { SyncEngine, type Push } from './syncEngine';

export interface BookSummary {
  id: string;
  title: string;
  shape: string;
  pageCount: number;
  contentLocale: string;
  updatedAtEpochMs: number;
  rasterParts: string[];
}

export interface RepositoryState {
  ready: boolean;
  owner: string | null;
  books: BookSummary[];
  readOnly: boolean;
  pendingChanges: boolean;
  syncError: string | null;
  entitlement: Record<string, unknown>;
}

/**
 * Local rows are authoritative, as the phone's files are. The row journal (owner, baseline,
 * revision) survives reloads and account changes, so offline edits are never lost or misfiled.
 */
export class BookRepository {
  readonly state = createStore<RepositoryState>({ ready: false, owner: null, books: [], readOnly: false, pendingChanges: false, syncError: null, entitlement: {} });
  liveBook: (id: string) => string | null = () => null;
  isGestureActive: () => boolean = () => false;
  onRemote: (json: string) => void = () => {};
  onIdentityChange: () => void = () => {};
  private readonly rows = new Map<string, BookRow>();
  private readonly summaries = new Map<string, BookSummary>();
  private readonly pendingRemote = new Map<string, { json: string; revision: number }>();
  private owner: string | null = null;
  private openId: string | null = null;

  constructor(private readonly store: LocalBookStore, readonly engine: SyncEngine | null, readonly library: PartLibrary) {
    if (engine) {
      engine.onRemote = (json, revision) => this.receive(json, revision);
      engine.onAcknowledged = (push, revision) => this.acknowledge(push, revision);
      engine.onDeleted = (id, revision) => this.remoteDelete(id, revision);
      engine.onError = (message) => this.state.update({ syncError: message });
      engine.onLease = (readOnly) => this.state.update({ readOnly });
      engine.onEntitlement = (fields) => this.state.update({ entitlement: fields });
      engine.onIllustrations = (uid, docs) => library.update(uid, docs);
    }
  }

  async load(): Promise<void> {
    for (const row of await this.store.loadAll()) this.rows.set(row.id, row);
    this.reload();
    this.state.update({ ready: true });
  }

  summary(json: string): BookSummary {
    const cached = this.summaries.get(json);
    if (cached) return cached;
    const summary = JSON.parse(codec.summaryJson(json)) as BookSummary;
    if (this.summaries.size >= 256) this.summaries.delete(this.summaries.keys().next().value!);
    this.summaries.set(json, summary);
    return summary;
  }

  bookJson(id: string): string | null {
    const row = this.rows.get(id);
    return row && this.visible(row) ? row.json : null;
  }

  /** False when the book belongs to another account or was deleted; the caller keeps its copy. */
  save(json: string, sync = true): boolean {
    let summary: BookSummary;
    try { summary = this.summary(json); } catch { return false; }
    const row = this.rows.get(summary.id);
    if (row?.deleted || (row?.owner != null && row.owner !== this.owner)) return false;
    if (row?.json === json) { if (sync) this.enqueue(row.id, json); return true; }
    const next: BookRow = row ? { ...row, json } : { id: summary.id, json, owner: this.owner, baseline: null, revision: 0, deleted: false, deleteAcknowledged: false };
    this.rows.set(next.id, next);
    this.persist(next);
    this.reload();
    if (sync) this.enqueue(next.id, json);
    void this.library.ensure(summary.rasterParts);
    return true;
  }

  delete(id: string): void {
    const row = this.rows.get(id);
    if (!row || (row.owner != null && row.owner !== this.owner)) return;
    if (row.owner != null) {
      const next = { ...row, deleted: true, deleteAcknowledged: false };
      this.rows.set(id, next);
      this.persist(next);
      this.enqueue(id, next.json);
    } else {
      this.rows.delete(id);
      void this.store.remove(id);
    }
    this.reload();
  }

  open(id: string, editing: boolean): void {
    this.openId = id;
    this.engine?.open(id, editing);
    const row = this.rows.get(id);
    if (row) void this.library.ensure(this.summary(row.json).rasterParts);
  }

  close(): void {
    this.engine?.close();
    this.openId = null;
    this.flushRemote();
  }

  flush(): Promise<void> { return this.store.whenIdle(); }

  saveOpenBook(): void {
    const live = this.openId ? this.liveBook(this.openId) : null;
    if (live) this.save(live);
  }

  setForeground(value: boolean): void {
    this.engine?.setForeground(value);
    if (value) for (const row of this.rows.values()) this.enqueue(row.id, row.json);
  }

  /** Remote documents wait for the local gesture to end, then land as one replacement. */
  flushRemote(): void {
    if (this.isGestureActive()) return;
    const waiting = [...this.pendingRemote.values()];
    this.pendingRemote.clear();
    for (const { json, revision } of waiting) this.receive(json, revision);
  }

  changeOwner(next: string | null): void {
    if (next === this.owner) return;
    // Capture the open editor before changing ownership or detaching its sync writer.
    const live = this.openId ? this.liveBook(this.openId) : null;
    if (live) this.save(live);
    this.engine?.stop();
    this.pendingRemote.clear();
    this.owner = next;
    this.state.update({ entitlement: {}, syncError: null, readOnly: false });
    this.onIdentityChange();
    this.openId = null;
    if (next) {
      // Only unclaimed local drafts are migrated. Previously owned rows keep their UID.
      for (const row of this.rows.values()) {
        if (row.owner == null) { const claimed = { ...row, owner: next }; this.rows.set(row.id, claimed); this.persist(claimed); }
      }
    }
    void this.library.selectOwner(next);
    if (next) this.engine?.start(next);
    this.reload();
    if (next) for (const row of this.rows.values()) if (row.owner === next) this.enqueue(row.id, row.json);
  }

  private receive(json: string, revision: number): void {
    const owner = this.owner;
    if (!owner) return;
    let id: string;
    try { id = this.summary(json).id; } catch { return; }
    const row = this.rows.get(id);
    if ((row?.owner != null && row.owner !== owner) || revision <= (row?.revision ?? 0)) return;
    if (id === this.openId && this.isGestureActive()) { this.pendingRemote.set(id, { json, revision }); return; }
    const local = this.liveBook(id) ?? (row && this.visible(row) ? row.json : null);
    let merged = json;
    if (local) {
      try { merged = codec.merge(local, row?.baseline ?? null, json); } catch { merged = json; }
    }
    const next: BookRow = { id, json: merged, owner, baseline: json, revision, deleted: row?.deleted ?? false, deleteAcknowledged: row?.deleteAcknowledged ?? false };
    this.rows.set(id, next);
    this.persist(next);
    this.reload();
    this.onRemote(merged);
    void this.library.ensure(this.summary(merged).rasterParts);
    this.enqueue(id, merged);
  }

  private acknowledge(push: Push, revision: number): void {
    const row = this.rows.get(push.id);
    if (!row || row.owner !== this.owner) return;
    let next = row;
    if (revision >= row.revision) next = { ...row, baseline: push.json, revision, deleteAcknowledged: push.deleted ? true : row.deleteAcknowledged };
    this.rows.set(push.id, next);
    this.state.update({ syncError: null });
    this.persist(next);
    this.reload();
    this.enqueue(push.id, this.liveBook(push.id) ?? next.json);
  }

  private remoteDelete(id: string, revision: number): void {
    const row = this.rows.get(id);
    if (!row || row.owner !== this.owner || revision < row.revision) return;
    // Keep the row as a recoverable archive, but never resurrect a cloud tombstone.
    const next = { ...row, deleted: true, deleteAcknowledged: true, revision };
    this.rows.set(id, next);
    this.persist(next);
    this.reload();
    if (this.openId === id) { this.close(); this.onIdentityChange(); }
  }

  private enqueue(id: string, json: string): void {
    const row = this.rows.get(id);
    if (!this.owner || !row || row.owner !== this.owner) return;
    if (row.deleted ? row.deleteAcknowledged : row.baseline === json) return;
    this.engine?.enqueue({ id, json, baseline: row.baseline, revision: row.revision, deleted: row.deleted });
  }

  private visible(row: BookRow): boolean {
    return !row.deleted && (row.owner == null || row.owner === this.owner);
  }

  private reload(): void {
    const rows = [...this.rows.values()];
    const books = rows.filter((row) => this.visible(row)).flatMap((row) => {
      try { return [this.summary(row.json)]; } catch { return []; }
    }).sort((a, b) => b.updatedAtEpochMs - a.updatedAtEpochMs);
    const pendingChanges = this.owner != null && (
      rows.some((row) => this.visible(row) && row.baseline !== row.json)
      || rows.some((row) => row.owner === this.owner && row.deleted && !row.deleteAcknowledged));
    this.state.update({ owner: this.owner, books, pendingChanges });
  }

  private persist(row: BookRow): void {
    void this.store.put(row).then((ok) => { if (!ok) this.state.update({ syncError: 'diskError' }); });
  }
}

let opening: Promise<BookRepository> | null = null;

/** One repository per tab, bound to the session and to page visibility. */
export function repository(): Promise<BookRepository> {
  opening ??= (async () => {
    const store = await LocalBookStore.open();
    const library = new PartLibrary(store);
    const engine = cloud ? new SyncEngine(firebase().db) : null;
    const repo = new BookRepository(store, engine, library);
    await repo.load();
    if (cloud) {
      startSession();
      const apply = () => { const state = session.get(); if (state.ready) repo.changeOwner(state.signedIn ? state.uid : null); };
      session.subscribe(apply);
      apply();
    }
    document.addEventListener('visibilitychange', () => {
      const visible = document.visibilityState === 'visible';
      if (!visible) repo.saveOpenBook();
      repo.setForeground(visible);
    });
    window.addEventListener('pagehide', () => { repo.saveOpenBook(); repo.close(); });
    return repo;
  })();
  return opening;
}

declare global { interface Window { __ehonRepository?: () => Promise<BookRepository> } }
// Browser tests drive the emulators through the same repository the UI uses.
if (isDev) window.__ehonRepository = repository;
