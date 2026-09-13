import { doc, onSnapshot, serverTimestamp, setDoc, type Unsubscribe } from 'firebase/firestore';
import { cloud } from './config';
import { firebase } from './firebase';
import { createStore } from './store';

/** An illustration parked on the desk around the frames, in desk units (CSS px at 100%). */
export interface ScratchItem { id: string; partId: string; x: number; y: number; w: number }
export interface WorkspaceState { items: ScratchItem[] }

const MAX_ITEMS = 200;
const PART = /^lib:[A-Za-z0-9_-]{1,128}$/;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function parseItems(raw: unknown): ScratchItem[] {
  if (!Array.isArray(raw)) return [];
  const items: ScratchItem[] = [];
  for (const entry of raw.slice(0, MAX_ITEMS)) {
    const item = entry as Partial<ScratchItem>;
    if (typeof item.id !== 'string' || typeof item.partId !== 'string' || !PART.test(item.partId) || !finite(item.x) || !finite(item.y) || !finite(item.w) || item.w <= 0) continue;
    items.push({ id: item.id, partId: item.partId, x: item.x, y: item.y, w: item.w });
  }
  return items;
}

/**
 * The web-only scratch area of one book (`workspaces/{bookId}`, decision 43). This browser's
 * copy is authoritative and lives in localStorage; the document mirrors it for the account's
 * other browsers, last writer wins. Nothing here is book content: the phone never reads it.
 */
export class Workspace {
  readonly state = createStore<WorkspaceState>({ items: [] });
  private owner: string | null = null;
  private listener: Unsubscribe | null = null;
  private dirty = false;
  private epoch = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(readonly bookId: string) {
    try {
      const saved = JSON.parse(localStorage.getItem(this.key) ?? '{}') as { items?: unknown; dirty?: unknown };
      this.state.set({ items: parseItems(saved.items) });
      // A reload inside the push debounce must not lose the change: the flag survives with the copy.
      this.dirty = saved.dirty === true;
    } catch { /* storage may be blocked or stale */ }
  }

  private readonly flush = () => { if (this.dirty) void this.push(); };

  private get key(): string { return `ehon-scratch:${this.bookId}`; }

  /** Binds the mirror to an account; null detaches it and keeps the local copy. */
  start(owner: string | null): void {
    if (owner === this.owner && this.listener) return;
    this.stop();
    this.owner = owner;
    if (!cloud || !owner) return;
    const generation = this.epoch;
    this.listener = onSnapshot(doc(firebase().db, 'workspaces', this.bookId), (snapshot) => {
      if (generation !== this.epoch || snapshot.metadata.hasPendingWrites || this.dirty) return;
      const data = snapshot.data();
      if (!data) return;
      this.state.set({ items: parseItems(data.scratch) });
      this.persistLocal();
    }, () => { /* a book not yet in the cloud has no workspace to read */ });
    window.addEventListener('pagehide', this.flush);
    if (this.dirty) this.schedule(0);
  }

  stop(): void {
    this.epoch++;
    this.listener?.();
    this.listener = null;
    window.removeEventListener('pagehide', this.flush);
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.flush();
  }

  set(items: ScratchItem[]): void {
    this.state.set({ items: items.slice(0, MAX_ITEMS) });
    this.dirty = true;
    this.persistLocal();
    this.schedule(1500);
  }

  add(item: Omit<ScratchItem, 'id'>): string {
    const id = crypto.randomUUID();
    this.set([...this.state.get().items, { id, ...item }]);
    return id;
  }

  update(id: string, patch: Partial<Omit<ScratchItem, 'id' | 'partId'>>): void {
    this.set(this.state.get().items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  remove(id: string): void {
    this.set(this.state.get().items.filter((item) => item.id !== id));
  }

  private persistLocal(): void {
    try { localStorage.setItem(this.key, JSON.stringify({ items: this.state.get().items, dirty: this.dirty })); } catch { /* per-session scratch is still usable */ }
  }

  private schedule(delay: number): void {
    if (!cloud || !this.owner) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; void this.push(); }, delay);
  }

  private async push(): Promise<void> {
    const owner = this.owner;
    if (!cloud || !owner || !this.dirty) return;
    const generation = this.epoch;
    const items = this.state.get().items;
    try {
      await setDoc(doc(firebase().db, 'workspaces', this.bookId), { ownerId: owner, scratch: items, updatedAt: serverTimestamp() });
      if (this.state.get().items === items) { this.dirty = false; this.persistLocal(); }
    } catch {
      // Rules refuse until the book itself has reached the cloud; the next try picks it up.
      if (generation === this.epoch) this.schedule(15_000);
    }
  }
}
