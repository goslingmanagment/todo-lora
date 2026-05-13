/**
 * Presigned URL helpers (§7).
 *
 * - Upload presigns are issued only for *staging* keys.
 * - Read presigns sign canonical attachment keys.
 * - We override the host on returned URLs to the user-facing endpoint
 *   (MINIO_PUBLIC_ENDPOINT) so the browser can talk to MinIO over the
 *   correct hostname even if the server uses a Docker-internal one.
 */
import { randomUUID } from 'node:crypto';
import { getStorageClient, STAGING_PREFIX, ATTACHMENT_PREFIX } from './client';
import { getConfig } from '@/lib/env';

const UPLOAD_TTL_SECONDS = 60 * 5;
const DOWNLOAD_TTL_SECONDS = 60 * 10;

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

export type PresignedUpload = {
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
  stagingKey: string;
  expiresAt: number;
};

export function newStagingKey(taskId: string, filename: string): string {
  const ext = sanitizeExt(filename);
  return `${STAGING_PREFIX}${taskId}/${randomUUID()}${ext ? `.${ext}` : ''}`;
}

export function newCanonicalKey(taskId: string): string {
  return `${ATTACHMENT_PREFIX}${taskId}/${randomUUID()}.bin`;
}

function sanitizeExt(filename: string): string | null {
  const dot = filename.lastIndexOf('.');
  if (dot < 0) return null;
  const raw = filename.slice(dot + 1).toLowerCase();
  if (!/^[a-z0-9]{1,8}$/.test(raw)) return null;
  return raw;
}

export async function createUploadPresign(
  taskId: string,
  filename: string,
  mimeType: string,
): Promise<PresignedUpload> {
  if (!ALLOWED_MIME.has(mimeType)) {
    throw new Error(`Unsupported MIME type: ${mimeType}`);
  }
  const cfg = getConfig().minio;
  const client = getStorageClient();
  const stagingKey = newStagingKey(taskId, filename);
  const internalUrl = await client.presignedPutObject(cfg.bucket, stagingKey, UPLOAD_TTL_SECONDS);
  const publicUrl = rewriteHost(internalUrl, cfg.publicEndpoint);
  return {
    url: publicUrl,
    method: 'PUT',
    headers: { 'Content-Type': mimeType },
    stagingKey,
    expiresAt: Date.now() + UPLOAD_TTL_SECONDS * 1000,
  };
}

export async function presignDownload(
  objectKey: string,
  ttlSeconds: number = DOWNLOAD_TTL_SECONDS,
): Promise<string> {
  const cfg = getConfig().minio;
  const client = getStorageClient();
  const internal = await client.presignedGetObject(cfg.bucket, objectKey, ttlSeconds);
  return rewriteHost(internal, cfg.publicEndpoint);
}

export async function deleteObject(key: string): Promise<void> {
  const cfg = getConfig().minio;
  const client = getStorageClient();
  await client.removeObject(cfg.bucket, key).catch(() => {
    // Best-effort: log via caller's logger. Don't crash the user-visible flow.
  });
}

export async function getObjectAsBuffer(key: string): Promise<Buffer> {
  const cfg = getConfig().minio;
  const client = getStorageClient();
  const stream = await client.getObject(cfg.bucket, key);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer));
  }
  return Buffer.concat(chunks);
}

export async function getObjectSize(key: string): Promise<number> {
  const cfg = getConfig().minio;
  const client = getStorageClient();
  const stat = await client.statObject(cfg.bucket, key);
  const size = Number(stat.size);
  if (!Number.isFinite(size) || size < 0) {
    throw new Error(`Invalid object size for ${key}`);
  }
  return size;
}

export async function putObjectBuffer(
  key: string,
  buf: Buffer,
  mimeType: string,
): Promise<void> {
  const cfg = getConfig().minio;
  const client = getStorageClient();
  await client.putObject(cfg.bucket, key, buf, buf.length, {
    'Content-Type': mimeType,
  });
}

function rewriteHost(internalUrl: string, publicEndpoint: string): string {
  try {
    const u = new URL(internalUrl);
    const pub = new URL(publicEndpoint);
    u.protocol = pub.protocol;
    u.host = pub.host;
    return u.toString();
  } catch {
    return internalUrl;
  }
}
