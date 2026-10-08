import fs from 'fs/promises';
import { unsupportedMediaType } from '../utils/errors';

/**
 * Upload policies and the signature checks for non-image files.
 *
 * The declared MIME type and file extension come from the client and decide
 * nothing. Images are trusted only once `sharp` has decoded them (see
 * image.service). PDFs and videos cannot be decoded here, so their leading
 * bytes — the file signature — must match a format on the allowlist; anything
 * else, however it is named, is refused with 415.
 */

const MiB = 1024 * 1024;
const MB = 1000 * 1000;

export interface MediaPolicy {
  maxBytes: number;
  mimeTypes: readonly string[];
  maxDurationSeconds?: number;
}

const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const MEDIA_POLICY = {
  PROFILE_PHOTO: { maxBytes: 5 * MiB, mimeTypes: IMAGE_MIME_TYPES },
  PORTFOLIO_PHOTO: { maxBytes: 10 * MiB, mimeTypes: IMAGE_MIME_TYPES },
  RESUME: { maxBytes: 5 * MiB, mimeTypes: ['application/pdf'] },
  // 100 MB is Cloudinary's per-video limit on the free plan.
  REEL: {
    maxBytes: 100 * MB,
    mimeTypes: ['video/mp4', 'video/quicktime', 'video/webm'],
    maxDurationSeconds: 180,
  },
} as const satisfies Record<string, MediaPolicy>;

async function readSlice(filePath: string, position: number, length: number): Promise<Buffer> {
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, position);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

async function sizeOf(filePath: string): Promise<number> {
  return (await fs.stat(filePath)).size;
}

/**
 * A PDF starts with `%PDF-` and ends with an `%%EOF` marker (possibly followed
 * by whitespace). Checking both rejects renamed files and most truncated
 * uploads before anything is sent to storage.
 */
export async function assertPdf(filePath: string): Promise<void> {
  const size = await sizeOf(filePath);
  if (size === 0) throw unsupportedMediaType('The uploaded file is empty');

  const head = await readSlice(filePath, 0, 5);
  if (head.toString('latin1') !== '%PDF-') {
    throw unsupportedMediaType('The uploaded file is not a PDF document');
  }

  const tailLength = Math.min(size, 2048);
  const tail = await readSlice(filePath, size - tailLength, tailLength);
  if (!tail.toString('latin1').includes('%%EOF')) {
    throw unsupportedMediaType('The PDF appears to be incomplete or damaged');
  }
}

export type VideoExtension = 'mp4' | 'mov' | 'webm';

/**
 * ISO base media brands accepted as video. HEIF/AVIF images share the same
 * container (`ftyp` box), so the brand — not just the box — must be a video one.
 */
const MP4_BRANDS = new Set([
  'isom', 'iso2', 'iso3', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'mp71', 'avc1',
  'M4V ', 'M4VH', 'M4VP', 'dash', 'MSNV', 'NDAS', 'f4v ', 'mmp4', '3gp4', '3gp5', '3gp6',
]); // prettier-ignore
const QUICKTIME_BRANDS = new Set(['qt  ']);
/** Very old QuickTime files open with one of these atoms instead of `ftyp`. */
const LEGACY_QUICKTIME_ATOMS = new Set(['moov', 'mdat', 'wide']);

/** Identify an MP4, MOV or WebM file by its signature, or throw 415. */
export async function detectVideo(filePath: string): Promise<VideoExtension> {
  const size = await sizeOf(filePath);
  if (size === 0) throw unsupportedMediaType('The uploaded file is empty');

  const head = await readSlice(filePath, 0, 64);

  // Matroska/WebM: EBML magic, then a DocType of "webm" in the header.
  if (head.length >= 4 && head.readUInt32BE(0) === 0x1a45dfa3) {
    if (head.includes(Buffer.from('webm', 'latin1'))) return 'webm';
    throw unsupportedMediaType('Only MP4, MOV and WebM videos are accepted');
  }

  if (head.length >= 12) {
    const box = head.toString('latin1', 4, 8);
    if (box === 'ftyp') {
      const brand = head.toString('latin1', 8, 12);
      if (QUICKTIME_BRANDS.has(brand)) return 'mov';
      if (MP4_BRANDS.has(brand)) return 'mp4';
    } else if (LEGACY_QUICKTIME_ATOMS.has(box)) {
      return 'mov';
    }
  }

  throw unsupportedMediaType('The uploaded file is not an MP4, MOV or WebM video');
}

/**
 * The name shown next to a CV. Path parts and control characters are removed
 * and the length is capped; it is display text only and never used on disk.
 *
 * multer 1.x decodes multipart file names as latin1, so a UTF-8 name such as
 * "अभिनय.pdf" arrives mangled; re-decode it when that round-trips cleanly.
 */
export function displayFileName(original: string | undefined, fallback: string): string {
  let name = original ?? '';
  const asUtf8 = Buffer.from(name, 'latin1').toString('utf8');
  if (!asUtf8.includes('�')) name = asUtf8;

  name = name
    .split(/[\\/]/)
    .pop()!
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();

  if (!name) return fallback;
  return Array.from(name).slice(0, 120).join('');
}
