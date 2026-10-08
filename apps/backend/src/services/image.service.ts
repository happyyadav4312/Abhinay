import sharp from 'sharp';
import { payloadTooLarge, unsupportedMediaType } from '../utils/errors';
import { MEDIA_POLICY } from './media-validation.service';

/** Documented profile-photo policy. Mirrored by the client-side file picker. */
export const UPLOAD_POLICY = {
  MAX_BYTES: MEDIA_POLICY.PROFILE_PHOTO.maxBytes, // 5 MiB
  MAX_DIMENSION: 6000, // px, per side, before processing
  OUTPUT_SIZE: 512, // px, square, after processing
  ALLOWED_FORMATS: ['jpeg', 'png', 'webp'] as const,
  ALLOWED_MIME_TYPES: MEDIA_POLICY.PROFILE_PHOTO.mimeTypes,
  OUTPUT_EXTENSION: 'webp',
} as const;

/** Portfolio photos keep their aspect ratio and are scaled down to fit this box. */
export const PORTFOLIO_OUTPUT_MAX_SIDE = 2048;

export interface ProcessedImage {
  bytes: Buffer;
  extension: string;
  width: number;
  height: number;
}

type ImageMode = { kind: 'avatar'; maxBytes: number } | { kind: 'portfolio'; maxBytes: number };

/**
 * Decode, validate and re-encode an uploaded image.
 *
 * The decision to trust the file is made by `sharp` actually parsing it, not by
 * the extension or the client-supplied MIME type. Re-encoding to a fresh WebP
 * also strips EXIF (including GPS location) and any polyglot payload smuggled
 * alongside the pixels, so nothing the client sent is ever stored verbatim.
 */
export async function processImage(input: Buffer, mode: ImageMode): Promise<ProcessedImage> {
  if (input.byteLength === 0) {
    throw unsupportedMediaType('The uploaded file is empty');
  }
  if (input.byteLength > mode.maxBytes) {
    throw payloadTooLarge(`Image must not exceed ${mode.maxBytes / (1024 * 1024)} MiB`);
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
    const pipeline = sharp(input, { failOn: 'error' }).rotate(); // apply EXIF orientation before it is stripped
    const resized =
      mode.kind === 'avatar'
        ? pipeline.resize(UPLOAD_POLICY.OUTPUT_SIZE, UPLOAD_POLICY.OUTPUT_SIZE, {
            fit: 'cover',
            position: 'centre',
            withoutEnlargement: false,
          })
        : pipeline.resize(PORTFOLIO_OUTPUT_MAX_SIDE, PORTFOLIO_OUTPUT_MAX_SIDE, {
            fit: 'inside',
            withoutEnlargement: true,
          });

    const { data, info } = await resized
      .toFormat(UPLOAD_POLICY.OUTPUT_EXTENSION, { quality: mode.kind === 'avatar' ? 82 : 85 })
      .toBuffer({ resolveWithObject: true });

    return {
      bytes: data,
      extension: UPLOAD_POLICY.OUTPUT_EXTENSION,
      width: info.width,
      height: info.height,
    };
  } catch {
    throw unsupportedMediaType('The uploaded image could not be processed');
  }
}

/** A 512×512 square WebP for the avatar. */
export function processProfilePhoto(input: Buffer): Promise<ProcessedImage> {
  return processImage(input, { kind: 'avatar', maxBytes: UPLOAD_POLICY.MAX_BYTES });
}

/** A WebP no larger than 2048 px on either side, aspect ratio kept. */
export function processPortfolioPhoto(input: Buffer): Promise<ProcessedImage> {
  return processImage(input, {
    kind: 'portfolio',
    maxBytes: MEDIA_POLICY.PORTFOLIO_PHOTO.maxBytes,
  });
}
