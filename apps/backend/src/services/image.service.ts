import sharp from 'sharp';
import { payloadTooLarge, unsupportedMediaType } from '../utils/errors';

/** Documented upload policy. Mirrored by the client-side file picker. */
export const UPLOAD_POLICY = {
  MAX_BYTES: 5 * 1024 * 1024, // 5 MiB
  MAX_DIMENSION: 6000, // px, per side, before processing
  OUTPUT_SIZE: 512, // px, square, after processing
  ALLOWED_FORMATS: ['jpeg', 'png', 'webp'] as const,
  ALLOWED_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp'] as const,
  OUTPUT_EXTENSION: 'webp',
} as const;

export interface ProcessedImage {
  bytes: Buffer;
  extension: string;
}

/**
 * Decode, validate and re-encode an uploaded image.
 *
 * The decision to trust the file is made by `sharp` actually parsing it, not by
 * the extension or the client-supplied MIME type. Re-encoding to a fresh WebP
 * also strips EXIF and any polyglot payload smuggled alongside the pixels, so
 * nothing the client sent is ever served back verbatim.
 */
export async function processProfilePhoto(input: Buffer): Promise<ProcessedImage> {
  if (input.byteLength === 0) {
    throw unsupportedMediaType('The uploaded file is empty');
  }
  if (input.byteLength > UPLOAD_POLICY.MAX_BYTES) {
    throw payloadTooLarge(`Image must not exceed ${UPLOAD_POLICY.MAX_BYTES / (1024 * 1024)} MiB`);
  }

  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(input, { failOn: 'error' }).metadata();
  } catch {
    // Covers SVG-with-script, renamed executables, truncated files, zip bombs.
    throw unsupportedMediaType('The uploaded file is not a readable JPEG, PNG or WebP image');
  }

  const format = metadata.format as (typeof UPLOAD_POLICY.ALLOWED_FORMATS)[number] | undefined;
  if (!format || !UPLOAD_POLICY.ALLOWED_FORMATS.includes(format)) {
    throw unsupportedMediaType('Only JPEG, PNG and WebP images are accepted');
  }

  const { width, height } = metadata;
  if (!width || !height) {
    throw unsupportedMediaType('The uploaded image has no readable dimensions');
  }
  if (width > UPLOAD_POLICY.MAX_DIMENSION || height > UPLOAD_POLICY.MAX_DIMENSION) {
    throw payloadTooLarge(
      `Image dimensions must not exceed ${UPLOAD_POLICY.MAX_DIMENSION}x${UPLOAD_POLICY.MAX_DIMENSION} pixels`
    );
  }

  try {
    const bytes = await sharp(input, { failOn: 'error' })
      .rotate() // apply EXIF orientation before it is stripped
      .resize(UPLOAD_POLICY.OUTPUT_SIZE, UPLOAD_POLICY.OUTPUT_SIZE, {
        fit: 'cover',
        position: 'centre',
        withoutEnlargement: false,
      })
      .toFormat(UPLOAD_POLICY.OUTPUT_EXTENSION, { quality: 82 })
      .toBuffer();

    return { bytes, extension: UPLOAD_POLICY.OUTPUT_EXTENSION };
  } catch {
    throw unsupportedMediaType('The uploaded image could not be processed');
  }
}
