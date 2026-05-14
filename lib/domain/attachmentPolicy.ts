import { MAX_IMAGE_BYTES } from '@/lib/domain/limits';

export { MAX_IMAGE_BYTES };

export const ATTACHMENT_LIMIT = 10;

export const IMAGE_MIME_VALUES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const;

export type ImageMimeType = (typeof IMAGE_MIME_VALUES)[number];

export const IMAGE_MIME_TYPES: ReadonlySet<string> = new Set(IMAGE_MIME_VALUES);
export const ACCEPTED_IMAGE_MIMES = IMAGE_MIME_VALUES.join(',');
