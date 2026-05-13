/**
 * EXIF stripping pipeline test.
 * We construct a JPEG with synthetic EXIF, run it through the same sharp
 * primitives our sanitize.ts uses, and assert metadata is gone.
 *
 * We re-implement just the sharp call here rather than mocking storage,
 * so this stays a fast unit test. The integration test in actions.test.ts
 * mocks `sanitizeStagedImage` since the real path requires MinIO.
 */
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';

async function makeJpegWithExif(): Promise<Buffer> {
  return sharp({
    create: {
      width: 64,
      height: 64,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .withMetadata({
      exif: {
        IFD0: { Copyright: 'unit-test', Software: 'unit-test' },
      },
    })
    .jpeg({ quality: 80 })
    .toBuffer();
}

async function strip(buf: Buffer): Promise<Buffer> {
  return sharp(buf).rotate().jpeg({ quality: 88 }).toBuffer();
}

describe('EXIF stripping', () => {
  it('removes EXIF metadata from re-encoded JPEG', async () => {
    const original = await makeJpegWithExif();
    const originalMeta = await sharp(original).metadata();
    expect(originalMeta.exif).toBeTruthy();

    const sanitized = await strip(original);
    const sanitizedMeta = await sharp(sanitized).metadata();
    expect(sanitizedMeta.exif).toBeFalsy();
  });
});
