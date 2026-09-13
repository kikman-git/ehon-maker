import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { FieldValue, Timestamp, type DocumentData, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

export const REQUEST_ID = /^[A-Za-z0-9_-]{22}$/;
export const CODE = /^[A-HJ-NP-Z2-9]{6}$/;
const SECRET_LENGTH = 43;
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const REQUEST_TTL_MS = 3 * 60_000;
export const MAX_CLIENT = 80;
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const gone = () => new HttpsError('not-found', 'This code is no longer valid.');

export interface Started { id: string; code: string; secret: string; expiresAt: number }
export type Claimed = { status: 'pending' } | { status: 'approved'; token: string };

/**
 * Hand-off from the signed-in phone app to a browser (decision 58). The browser starts a request and
 * keeps its secret; the QR code and the six-letter code carry only the request id. The app approves
 * with its own account, and the browser then claims a custom token for that account. No bearer
 * credential is ever stored: the token is minted at claim time and handed over once.
 */
export class LoginService {
  constructor(
    private readonly db: Firestore,
    private readonly mint: (uid: string) => Promise<string>,
    private readonly now: () => number = Date.now,
  ) {}

  async start(client: unknown): Promise<Started> {
    if (client !== undefined && typeof client !== 'string') throw new HttpsError('invalid-argument', 'Invalid client.');
    const id = randomBytes(16).toString('base64url');
    const secret = randomBytes(32).toString('base64url');
    const expiresAt = this.now() + REQUEST_TTL_MS;
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
      if ((await this.openByCode(code)).length > 0) continue;
      await this.db.doc(`loginRequests/${id}`).create({
        code, secretHash: sha256(secret), client: (client ?? '').trim().slice(0, MAX_CLIENT), status: 'pending', uid: null,
        createdAt: FieldValue.serverTimestamp(), expiresAt: Timestamp.fromMillis(expiresAt), approvedAt: null,
      });
      return { id, code, secret, expiresAt };
    }
    throw new HttpsError('resource-exhausted', 'Try again in a moment.');
  }

  /** The app's side: `id` from the QR code or `code` typed by hand. The caller must already be a real account. */
  async approve(uid: string, input: { id?: unknown; code?: unknown }): Promise<{ client: string }> {
    const ref = await this.locate(input);
    return this.db.runTransaction(async tx => {
      const request = (await tx.get(ref)).data();
      if (!request || request.status !== 'pending' || !this.live(request)) throw gone();
      tx.update(ref, { status: 'approved', uid, approvedAt: FieldValue.serverTimestamp() });
      return { client: String(request.client ?? '') };
    });
  }

  /** The browser's side, polled until the app approves; the request is spent before the token is minted. */
  async claim(id: unknown, secret: unknown): Promise<Claimed> {
    if (typeof id !== 'string' || !REQUEST_ID.test(id) || typeof secret !== 'string' || secret.length !== SECRET_LENGTH) {
      throw new HttpsError('invalid-argument', 'Invalid request.');
    }
    const ref = this.db.doc(`loginRequests/${id}`);
    const uid = await this.db.runTransaction(async tx => {
      const request = (await tx.get(ref)).data();
      if (!request || !this.sameSecret(request.secretHash, secret) || !this.live(request)) throw gone();
      if (request.status === 'pending') return null;
      if (request.status !== 'approved' || typeof request.uid !== 'string') throw gone();
      tx.update(ref, { status: 'done' });
      return request.uid as string;
    });
    return uid ? { status: 'approved', token: await this.mint(uid) } : { status: 'pending' };
  }

  private sameSecret(hash: unknown, secret: string): boolean {
    const expected = Buffer.from(sha256(secret));
    const actual = Buffer.from(typeof hash === 'string' ? hash : '');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  private live(request: DocumentData): boolean {
    const at: unknown = request.expiresAt;
    return at instanceof Timestamp && at.toMillis() > this.now();
  }

  private async openByCode(code: string) {
    const matches = await this.db.collection('loginRequests').where('code', '==', code).get();
    return matches.docs.filter(doc => doc.data().status === 'pending' && this.live(doc.data()));
  }

  private async locate({ id, code }: { id?: unknown; code?: unknown }): Promise<DocumentReference> {
    if (typeof id === 'string' && REQUEST_ID.test(id)) return this.db.doc(`loginRequests/${id}`);
    const typed = typeof code === 'string' ? code.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
    if (!CODE.test(typed)) throw new HttpsError('invalid-argument', 'Scan the QR code or enter its six-letter code.');
    const open = await this.openByCode(typed);
    if (open.length !== 1) throw gone();
    return open[0].ref;
  }
}
