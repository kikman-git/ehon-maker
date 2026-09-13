import { doc, getDoc } from 'firebase/firestore';
import { cloud } from './config';
import { firebase } from './firebase';
import { type LocalBookStore } from './localStore';
import { libraryPart, registerParts, type LibraryPart, type LibraryState, type PartTarget } from './parts';
import { session } from './session';
import { createStore } from './store';
import { type IllustrationDoc } from './syncEngine';

export type { LibraryPart, LibraryState, PartTarget } from './parts';
export { libraryPart } from './parts';

const ID = /^[A-Za-z0-9_-]{1,128}$/;

/** The account's illustrations as parts, cached per owner so books still paint offline. */
export class PartLibrary {
  readonly state = createStore<LibraryState>({ owner: null, parts: [] });
  private parts = new Map<string, LibraryPart>();
  private owner: string | null = null;
  private requested = new Set<string>();

  constructor(private readonly store: LocalBookStore) {}

  find(partId: string): LibraryPart | undefined { return this.parts.get(partId); }

  async selectOwner(uid: string | null): Promise<void> {
    this.owner = uid;
    this.parts = new Map();
    this.requested.clear();
    if (uid) {
      const saved = await this.store.loadLibrary(uid);
      if (this.owner !== uid) return;
      for (const [partId, part] of Object.entries(saved?.parts ?? {})) this.parts.set(partId, { partId, ...part });
    }
    this.publish();
  }

  update(uid: string, docs: IllustrationDoc[]): void {
    if (this.owner !== uid) return;
    for (const item of docs) {
      const part = libraryPart(item.id, item.data);
      if (part) this.parts.set(part.partId, part);
    }
    this.persist(uid);
    this.publish();
  }

  /** Resolves `lib:` parts a book references that the listener has not delivered (yet). */
  async ensure(partIds: string[]): Promise<void> {
    const uid = this.owner;
    if (!cloud || !uid || !session.get().signedIn) return;
    for (const partId of partIds) {
      if (!partId.startsWith('lib:') || this.parts.has(partId) || this.requested.has(partId)) continue;
      const raw = partId.slice(4);
      if (!ID.test(raw)) continue;
      this.requested.add(partId);
      try {
        const snapshot = await getDoc(doc(firebase().db, 'illustrations', raw));
        const data = snapshot.data();
        if (this.owner === uid && data && data.deleted !== true) this.update(uid, [{ id: raw, data }]);
      } catch { this.requested.delete(partId); }
    }
  }

  /** Registers every known part on a freshly created editor or reader. */
  apply(target: PartTarget, extra: LibraryPart[] = []): void {
    registerParts(target, [...this.parts.values(), ...extra]);
  }

  private persist(uid: string): void {
    const parts: Record<string, { masterRef: string; w: number; h: number; title: string }> = {};
    for (const part of this.parts.values()) parts[part.partId] = { masterRef: part.masterRef, w: part.w, h: part.h, title: part.title };
    void this.store.putLibrary({ owner: uid, parts });
  }

  private publish(): void {
    this.state.set({ owner: this.owner, parts: [...this.parts.values()].sort((a, b) => a.title.localeCompare(b.title, 'ja')) });
  }
}
