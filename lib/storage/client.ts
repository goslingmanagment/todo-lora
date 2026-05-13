/**
 * MinIO / S3-compatible storage client. Server-only.
 *
 * The browser never touches this client. All bucket interactions
 * (presign, list, head, delete) happen server-side.
 */
import { Client as MinioClient } from 'minio';
import { getConfig } from '@/lib/env';

declare global {
  var __todoLoraMinio: MinioClient | undefined;
}

export function getStorageClient(): MinioClient {
  if (globalThis.__todoLoraMinio) return globalThis.__todoLoraMinio;
  const cfg = getConfig().minio;
  const client = new MinioClient({
    endPoint: cfg.endpoint,
    port: cfg.port,
    useSSL: cfg.useSSL,
    accessKey: cfg.accessKey,
    secretKey: cfg.secretKey,
    region: cfg.region,
  });
  globalThis.__todoLoraMinio = client;
  return client;
}

export const STAGING_PREFIX = 'staging/';
export const ATTACHMENT_PREFIX = 'attachments/';

export async function ensureBucket(): Promise<void> {
  const cfg = getConfig().minio;
  const client = getStorageClient();
  const exists = await client.bucketExists(cfg.bucket).catch(() => false);
  if (!exists) {
    await client.makeBucket(cfg.bucket, cfg.region);
  }
}
