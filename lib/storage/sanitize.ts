/**
 * Server-side EXIF stripping pipeline (§7.3.1).
 *
 * Inputs come from a staging key in MinIO. We:
 *  - read the staged bytes
 *  - re-encode with sharp using `withMetadata({ exif: {} })` (drops EXIF/XMP/IPTC)
 *  - convert HEIC/HEIF → JPEG (browsers can't render HEIC reliably)
 *  - write the canonical object
 *  - delete the staging object
 *
 * Returns the canonical object key + metadata for the attachments row.
 */
import sharp from 'sharp';
import {
  deleteObject,
  getObjectAsBuffer,
  newCanonicalKey,
  putObjectBuffer,
} from './presign';
import { STAGING_PREFIX } from './client';

const MAX_PIXELS = 50_000_000;
const STAGING_OBJECT_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/;

export type SanitizedImage = {
  objectKey: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
};

export async function sanitizeStagedImage(
  taskId: string,
  stagingKey: string,
): Promise<SanitizedImage> {
  const expectedPrefix = `${STAGING_PREFIX}${taskId}/`;
  const objectName = stagingKey.slice(expectedPrefix.length);
  if (
    !stagingKey.startsWith(expectedPrefix) ||
    !STAGING_OBJECT_NAME_RE.test(objectName) ||
    objectName === '.' ||
    objectName === '..'
  ) {
    throw new Error('Refusing non-staging key');
  }

  let raw: Buffer;
  try {
    raw = await getObjectAsBuffer(stagingKey);
  } catch (err) {
    throw new Error(`Cannot read staged object: ${(err as Error).message}`);
  }

  // Sharp's docs note that calling `.metadata()` consumes the pipeline,
  // so we deliberately construct two independent pipelines from the same
  // input buffer: one to peek at the format, another to re-encode. Sharp
  // pipelines are cheap to instantiate; the `raw` buffer is the expensive
  // part and is reused.
  const sharpOpts = { failOn: 'error' as const, limitInputPixels: MAX_PIXELS };
  let meta: sharp.Metadata;
  let outputMime = 'image/jpeg';
  let reencoded: Buffer;
  try {
    meta = await sharp(raw, sharpOpts).metadata();

    // Re-encode. HEIC/HEIF → JPEG. Otherwise preserve the input format.
    let outputFormat: 'jpeg' | 'png' | 'webp' = 'jpeg';
    if (meta.format === 'png') {
      outputFormat = 'png';
      outputMime = 'image/png';
    } else if (meta.format === 'webp') {
      outputFormat = 'webp';
      outputMime = 'image/webp';
    }

    reencoded = await sharp(raw, sharpOpts)
      .rotate() // honor any orientation EXIF, then strip
      .toFormat(outputFormat, { quality: 88 })
      // sharp drops metadata by default unless withMetadata is called.
      // We do NOT call withMetadata, ensuring EXIF is removed.
      .toBuffer();
  } catch (err) {
    // The original (still-with-EXIF) bytes are sitting in the staging key.
    // Make a best-effort cleanup so corrupt metadata or corrupt pixels don't
    // leave private metadata lingering in MinIO. We swallow the cleanup error
    // and re-throw the original sharp failure so the caller sees the real
    // reason.
    await deleteObject(stagingKey).catch(() => {});
    throw err;
  }

  const canonicalKey = newCanonicalKey(taskId);
  try {
    await putObjectBuffer(canonicalKey, reencoded, outputMime);
  } catch (err) {
    await deleteObject(stagingKey).catch(() => {});
    throw err;
  }
  await deleteObject(stagingKey);

  return {
    objectKey: canonicalKey,
    mimeType: outputMime,
    sizeBytes: reencoded.length,
    width: meta.width ?? null,
    height: meta.height ?? null,
  };
}
