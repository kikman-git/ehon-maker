/** A book row: the local file plus its sync journal entry, kept together in IndexedDB. */
export interface BookRow {
  id: string;
  json: string;
  owner: string | null;
  baseline: string | null;
  revision: number;
  deleted: boolean;
  deleteAcknowledged: boolean;
}

export interface LibraryRow { owner: string; parts: Record<string, { masterRef: string; w: number; h: number; title: string }> }

/**
 * The browser's durable copy of every book. Writes are serialized so a later save can never
 * be overtaken by an earlier one; when IndexedDB is unavailable the store degrades to memory.
 */
export class LocalBookStore {
  private queue: Promise<unknown> = Promise.resolve();
  private constructor(private readonly db: IDBDatabase | null, readonly durable: boolean) {}

  static async open(name = 'ehon'): Promise<LocalBookStore> {
    try {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name, 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore('books', { keyPath: 'id' });
          request.result.createObjectStore('library', { keyPath: 'owner' });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('blocked'));
      });
      return new LocalBookStore(db, true);
    } catch {
      return new LocalBookStore(null, false);
    }
  }

  loadAll(): Promise<BookRow[]> { return this.read<BookRow[]>('books', (store) => store.getAll(), []); }
  put(row: BookRow): Promise<boolean> { return this.write('books', (store) => store.put(row)); }
  remove(id: string): Promise<boolean> { return this.write('books', (store) => store.delete(id)); }
  loadLibrary(owner: string): Promise<LibraryRow | undefined> { return this.read<LibraryRow | undefined>('library', (store) => store.get(owner), undefined); }
  putLibrary(row: LibraryRow): Promise<boolean> { return this.write('library', (store) => store.put(row)); }

  /** Resolves once every queued write has committed; navigate away only after this. */
  whenIdle(): Promise<void> { return this.queue.then(() => undefined, () => undefined); }

  close(): void { this.db?.close(); }

  private read<T>(name: string, run: (store: IDBObjectStore) => IDBRequest, fallback: T): Promise<T> {
    if (!this.db) return Promise.resolve(fallback);
    const db = this.db;
    return new Promise<T>((resolve) => {
      try {
        const request = run(db.transaction(name, 'readonly').objectStore(name));
        request.onsuccess = () => resolve(request.result as T);
        request.onerror = () => resolve(fallback);
      } catch { resolve(fallback); }
    });
  }

  private write(name: string, run: (store: IDBObjectStore) => IDBRequest): Promise<boolean> {
    if (!this.db) return Promise.resolve(true);
    const db = this.db;
    const next = this.queue.then(() => new Promise<boolean>((resolve) => {
      try {
        const transaction = db.transaction(name, 'readwrite');
        run(transaction.objectStore(name));
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => resolve(false);
        transaction.onabort = () => resolve(false);
      } catch { resolve(false); }
    }));
    this.queue = next.catch(() => false);
    return next;
  }
}
