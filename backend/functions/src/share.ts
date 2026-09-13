import { createHash, randomBytes } from 'node:crypto';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

const ID = /^[A-Za-z0-9_-]{1,128}$/;
export const TOKEN = /^[A-Za-z0-9_-]{32}$/;
export const MAX_ACTIVE_SHARES = 50;
export const MAX_LABEL = 40;
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

export interface GuestPart { partId: string; masterRef: string; w: number; h: number }
export interface GuestBook { title: string; meta: string; pages: string[]; parts: GuestPart[]; updatedAt: number }

/** Read-only guest links: one revocable token per recipient, no expiry, no login (decision 41). */
export class ShareService {
  constructor(private readonly db: Firestore) {}

  async create(uid: string, bookId: unknown, label: unknown): Promise<{ token: string }> {
    if (typeof bookId !== 'string' || !ID.test(bookId)) throw new HttpsError('invalid-argument', 'Invalid book.');
    if (label !== undefined && typeof label !== 'string') throw new HttpsError('invalid-argument', 'Invalid label.');
    const book = (await this.db.doc(`books/${bookId}`).get()).data();
    if (book?.ownerId !== uid || book.deleted !== false) throw new HttpsError('permission-denied', 'Book not available.');
    const active = await this.db.collection('shares').where('ownerId', '==', uid).where('bookId', '==', bookId)
      .where('revokedAt', '==', null).count().get();
    if (active.data().count >= MAX_ACTIVE_SHARES) throw new HttpsError('resource-exhausted', 'Too many links for this book.');
    const token = randomBytes(24).toString('base64url');
    await this.db.doc(`shares/${token}`).create({
      ownerId: uid, bookId, label: (label ?? '').trim().slice(0, MAX_LABEL), createdAt: FieldValue.serverTimestamp(), revokedAt: null,
    });
    return { token };
  }

  async revoke(uid: string, token: unknown): Promise<{ revoked: boolean }> {
    if (typeof token !== 'string' || !TOKEN.test(token)) throw new HttpsError('invalid-argument', 'Invalid link.');
    const ref = this.db.doc(`shares/${token}`);
    return this.db.runTransaction(async tx => {
      const share = (await tx.get(ref)).data();
      if (share?.ownerId !== uid) throw new HttpsError('permission-denied', 'This link is not yours.');
      if (share.revokedAt) return { revoked: false };
      tx.update(ref, { revokedAt: FieldValue.serverTimestamp() });
      return { revoked: true };
    });
  }

  /** Null for unknown or revoked tokens and for torn snapshots; the guest page shows one message for all. */
  async guestBook(token: string): Promise<GuestBook | null> {
    if (!TOKEN.test(token)) return null;
    const share = (await this.db.doc(`shares/${token}`).get()).data();
    if (!share || share.revokedAt || typeof share.bookId !== 'string' || !ID.test(share.bookId)) return null;
    const bookRef = this.db.doc(`books/${share.bookId}`);
    const book = (await bookRef.get()).data();
    if (!book || book.deleted !== false || book.ownerId !== share.ownerId || typeof book.meta !== 'string') return null;
    const ids: unknown = book.pageIds;
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 200 || !ids.every(id => typeof id === 'string' && ID.test(id))) return null;
    const docs = await this.db.getAll(...ids.map(id => bookRef.collection('pages').doc(id)));
    const pages = docs.map(doc => doc.data()?.json);
    if (!pages.every((json, index): json is string => typeof json === 'string' && sha256(json) === book.pageHashes?.[ids[index]])) return null;
    const parts = await this.parts(share.ownerId, pages);
    let title = '';
    try { title = String(JSON.parse(book.meta).book?.title ?? ''); } catch { /* the client validates the codec envelope */ }
    return { title, meta: book.meta, pages, parts, updatedAt: book.updatedAt?.toMillis?.() ?? 0 };
  }

  private async parts(ownerId: string, pages: string[]): Promise<GuestPart[]> {
    const ids = new Set<string>();
    for (const json of pages) {
      let items: unknown;
      try { items = JSON.parse(json).page?.items; } catch { continue; }
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        const partId = item?.type === 'part' ? item.partId?.value : undefined;
        if (typeof partId === 'string' && partId.startsWith('lib:') && ID.test(partId.slice(4))) ids.add(partId.slice(4));
      }
    }
    if (ids.size === 0) return [];
    const docs = await this.db.getAll(...[...ids].map(id => this.db.doc(`illustrations/${id}`)));
    return docs.flatMap(doc => {
      const data = doc.data();
      if (!data || data.deleted || data.ownerId !== ownerId || typeof data.masterRef !== 'string') return [];
      return [{ partId: `lib:${doc.id}`, masterRef: data.masterRef, w: Number(data.w), h: Number(data.h) }];
    });
  }
}
