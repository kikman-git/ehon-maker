import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { HttpsError, type HttpsFunction, type Request } from 'firebase-functions/v2/https';
import { MAX_UPLOAD_BYTES, type BlobStore } from './assets';

const KEY = /^(?:u\/[A-Za-z0-9_-]+\/(?:master|source|voice)\/[a-f0-9]{64}\/[A-Za-z0-9_.-]+|a\/[a-f0-9]{64}\/(?:m\.png|1024\.webp|256\.webp)|s\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[1-9][0-9]*\.zip|v\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.m4a)$/;
type Response = Parameters<HttpsFunction>[1];
const MIME: Record<string, string> = { png: 'image/png', webp: 'image/webp', zip: 'application/zip', m4a: 'audio/mp4' };

/**
 * Emulator stand-in for R2: blobs live under functions/.blobs and the `localBlob` HTTP function
 * plays both the presigned PUT endpoint and the assets domain. Never deployed.
 */
export class LocalBlobStore implements BlobStore {
  constructor(private readonly root: string, private readonly baseUrl: string) {}

  static keyOf(path: string): string | null {
    const key = decodeURIComponent(path).replace(/^\/+/, '');
    return KEY.test(key) ? key : null;
  }

  async presignPut(key: string, mime: string, bytes: number, hash: string) {
    return { url: `${this.baseUrl}/${key}?sha256=${hash}&bytes=${bytes}`, headers: { 'Content-Type': mime } };
  }
  async presignGet(key: string) { return `${this.baseUrl}/${key}?signed=1`; }
  async read(key: string) {
    try { return await readFile(this.file(key)); }
    catch { throw new HttpsError('not-found', 'Upload not found.'); }
  }
  async write(key: string, bytes: Buffer) {
    const file = this.file(key);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, bytes);
  }

  /** PUT stores an upload after checking its declared checksum; GET serves public and signed keys alike. */
  async handle(request: Request, response: Response): Promise<void> {
    const origin = request.headers.origin;
    response.set('Access-Control-Allow-Origin', origin ?? '*');
    response.set('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
    response.set('Access-Control-Allow-Headers', 'Content-Type, x-amz-checksum-sha256');
    response.set('X-Content-Type-Options', 'nosniff');
    if (request.method === 'OPTIONS') { response.status(204).end(); return; }
    const key = LocalBlobStore.keyOf(request.path.replace(/^\/localBlob/, ''));
    if (!key) { response.status(404).end(); return; }
    if (request.method === 'PUT') {
      const body = Buffer.isBuffer(request.body) ? request.body : Buffer.from(request.rawBody ?? '');
      const hash = createHash('sha256').update(body).digest('hex');
      if (!key.startsWith('u/') || body.length === 0 || body.length > MAX_UPLOAD_BYTES || hash !== request.query.sha256) { response.status(400).end(); return; }
      await this.write(key, body);
      response.status(200).end();
      return;
    }
    if (request.method !== 'GET') { response.status(405).end(); return; }
    if (key.startsWith('u/') || ((key.startsWith('s/') || key.startsWith('v/')) && request.query.signed !== '1')) { response.status(403).end(); return; }
    try {
      const bytes = await readFile(this.file(key));
      response.set('Content-Type', MIME[key.split('.').pop() ?? ''] ?? 'application/octet-stream');
      response.set('Cache-Control', key.startsWith('a/') ? 'public, max-age=31536000, immutable' : 'private, no-store');
      response.status(200).send(bytes);
    } catch { response.status(404).end(); }
  }

  private file(key: string): string {
    const path = resolve(this.root, ...key.split('/'));
    if (!path.startsWith(resolve(this.root) + sep)) throw new HttpsError('invalid-argument', 'Invalid key.');
    return path;
  }
}
