import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { HttpsError } from 'firebase-functions/v2/https';
import { MAX_UPLOAD_BYTES, type BlobStore } from './assets';

export class R2Store implements BlobStore {
  private readonly client: S3Client;
  constructor(private readonly bucket: string, endpoint: string, accessKeyId: string, secretAccessKey: string) {
    this.client = new S3Client({ region: 'auto', endpoint, credentials: { accessKeyId, secretAccessKey },
      requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' });
  }
  async presignPut(key: string, mime: string, bytes: number, hash: string) {
    const checksum = Buffer.from(hash, 'hex').toString('base64');
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: mime, ContentLength: bytes, ChecksumSHA256: checksum });
    const url = await getSignedUrl(this.client, command, { expiresIn: 600,
      signableHeaders: new Set(['content-type', 'content-length']), unhoistableHeaders: new Set(['x-amz-checksum-sha256']) });
    return { url, headers: { 'Content-Type': mime, 'x-amz-checksum-sha256': checksum } };
  }
  presignGet(key: string) {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: 600 });
  }
  async read(key: string) {
    const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!response.Body || (response.ContentLength ?? Infinity) > MAX_UPLOAD_BYTES) throw new HttpsError('invalid-argument', 'Upload too large.');
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      size += chunk.length;
      if (size > MAX_UPLOAD_BYTES) throw new HttpsError('invalid-argument', 'Upload too large.');
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  async write(key: string, bytes: Buffer, mime: string, cacheControl: string) {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: bytes, ContentType: mime, CacheControl: cacheControl }));
  }
}
