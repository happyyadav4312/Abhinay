import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { StorageProvider } from '@prisma/client';
import { v2 as cloudinary, UploadApiOptions, UploadApiResponse } from 'cloudinary';
import { mediaStorageUnavailable, mediaUploadFailed } from '../utils/errors';
import { env } from './env';

/**
 * Media storage.
 *
 * Uploaded files never go into the database. The flow for every upload is:
 *
 *   1. multer writes the request's file to UPLOAD_TMP_DIR (local disk);
 *   2. the service validates it, and re-encodes images;
 *   3. a driver below uploads it — to Cloudinary by default;
 *   4. only after that succeeds is the provider, key and URL written to the row;
 *   5. the temporary file is deleted when the request ends, whatever happened.
 *
 * Two drivers implement the same interface. CLOUDINARY is the default; LOCAL
 * copies the file under STORAGE_ROOT and serves it from `/media/<category>`. The
 * test suites use LOCAL, and so do profile photos uploaded before Cloudinary.
 * Every stored row records its provider, so a file is always deleted through
 * the driver that holds it, whichever one is active for new uploads.
 */

/** URL prefix the LOCAL driver serves from. */
export const MEDIA_ROUTE_PREFIX = '/media';

/** One folder per kind of file, in both drivers. */
export const MEDIA_CATEGORIES = ['profile-photos', 'resumes', 'portfolio-photos', 'reels'] as const;
export type MediaCategory = (typeof MEDIA_CATEGORIES)[number];

/** Kept for photos stored before Cloudinary: `profiles.profile_image` holds a key under this path. */
export const PUBLIC_MEDIA_PATH = `${MEDIA_ROUTE_PREFIX}/profile-photos`;

/** Cloudinary's resource types; `raw` is used for PDFs so they are delivered unaltered. */
export type MediaResourceType = 'image' | 'video' | 'raw';

export interface UploadRequest {
  /** A file inside UPLOAD_TMP_DIR. The driver reads it and never deletes it. */
  localPath: string;
  category: MediaCategory;
  resourceType: MediaResourceType;
  /** Lowercase extension without a dot, chosen by the server, never by the client. */
  extension: string;
}

export interface StoredMedia {
  provider: StorageProvider;
  /** Cloudinary public_id, or the LOCAL file name. */
  key: string;
  url: string;
  bytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  /** A still frame for videos, when the provider can make one. */
  thumbnailUrl: string | null;
}

export interface StoredFileRef {
  key: string;
  category: MediaCategory;
  resourceType: MediaResourceType;
}

export interface MediaStorage {
  readonly provider: StorageProvider;
  /** False when the driver cannot work at all (e.g. missing credentials). */
  isAvailable(): boolean;
  upload(request: UploadRequest): Promise<StoredMedia>;
  /** Delete a stored file. A file that is already gone is not an error. */
  remove(file: StoredFileRef): Promise<void>;
}

// ── LOCAL ───────────────────────────────────────────────

/**
 * Keys are generated here and never derived from a client filename, so
 * `../../etc/passwd` style input has nothing to attach to. This guard is the
 * second line of defence for keys read back out of the database.
 */
function assertSafeLocalKey(key: string): void {
  if (!/^[A-Za-z0-9_-]+\.(jpg|png|webp|pdf|mp4|mov|webm)$/.test(key)) {
    throw new Error('Refusing to operate on an unexpected storage key');
  }
}

export class LocalMediaStorage implements MediaStorage {
  readonly provider = StorageProvider.LOCAL;

  constructor(private readonly root: string) {}

  isAvailable(): boolean {
    return true;
  }

  /** Absolute directory served read-only over `/media/<category>`. */
  directoryFor(category: MediaCategory): string {
    return path.join(this.root, category);
  }

  async upload(request: UploadRequest): Promise<StoredMedia> {
    const key = `${crypto.randomUUID()}.${request.extension}`;
    assertSafeLocalKey(key);

    const directory = this.directoryFor(request.category);
    await fs.mkdir(directory, { recursive: true });
    const target = this.resolveInside(request.category, key);
    await fs.copyFile(request.localPath, target, fs.constants.COPYFILE_EXCL);
    const { size } = await fs.stat(target);

    return {
      provider: this.provider,
      key,
      url: `${env.PUBLIC_SERVER_URL}${MEDIA_ROUTE_PREFIX}/${request.category}/${key}`,
      bytes: size,
      width: null,
      height: null,
      durationSeconds: null,
      thumbnailUrl: null,
    };
  }

  async remove(file: StoredFileRef): Promise<void> {
    assertSafeLocalKey(file.key);
    await fs.rm(this.resolveInside(file.category, file.key), { force: true });
  }

  /**
   * Resolve a key and prove the result is still inside the category directory
   * before any filesystem call touches it.
   */
  private resolveInside(category: MediaCategory, key: string): string {
    const root = path.resolve(this.directoryFor(category));
    const target = path.resolve(root, key);
    if (target !== root && !target.startsWith(root + path.sep)) {
      throw new Error('Resolved storage path escapes the storage root');
    }
    return target;
  }
}

// ── CLOUDINARY ──────────────────────────────────────────

const MB = 1000 * 1000;

/** Videos go up in chunks, so one slow chunk can be retried by the SDK rather than the whole file. */
const VIDEO_CHUNK_BYTES = 20 * MB;
const UPLOAD_TIMEOUT_MS = { image: 2 * 60_000, raw: 2 * 60_000, video: 10 * 60_000 } as const;

/** What the Cloudinary SDK rejects with: an `{ error: { message, http_code } }` wrapper or an Error. */
function describeCloudinaryError(error: unknown): string {
  const inner =
    typeof error === 'object' && error !== null && 'error' in error
      ? (error as { error: unknown }).error
      : error;
  if (typeof inner === 'object' && inner !== null) {
    const { message, http_code: httpCode } = inner as { message?: unknown; http_code?: unknown };
    return `${typeof httpCode === 'number' ? `HTTP ${httpCode}: ` : ''}${String(message ?? 'unknown error')}`;
  }
  return String(inner);
}

export interface CloudinaryCredentials {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  folder: string;
}

export class CloudinaryMediaStorage implements MediaStorage {
  readonly provider = StorageProvider.CLOUDINARY;
  private configured = false;

  constructor(private readonly credentials: CloudinaryCredentials) {}

  isAvailable(): boolean {
    const { cloudName, apiKey, apiSecret } = this.credentials;
    return Boolean(cloudName && apiKey && apiSecret);
  }

  private client(): typeof cloudinary {
    if (!this.isAvailable()) throw mediaStorageUnavailable();
    if (!this.configured) {
      cloudinary.config({
        cloud_name: this.credentials.cloudName,
        api_key: this.credentials.apiKey,
        api_secret: this.credentials.apiSecret,
        secure: true,
      });
      this.configured = true;
    }
    return cloudinary;
  }

  async upload(request: UploadRequest): Promise<StoredMedia> {
    const client = this.client();
    const folder = `${this.credentials.folder}/${request.category}`;
    const id = crypto.randomUUID();

    const options: UploadApiOptions = {
      resource_type: request.resourceType,
      type: 'upload',
      // `folder` places the file under abhinay/<category> in fixed-folder
      // accounts; `asset_folder` does the same in dynamic-folder accounts.
      folder,
      asset_folder: folder,
      // Raw files keep their extension in the public id, so the delivery URL
      // ends in `.pdf` and browsers open it as a PDF.
      public_id: request.resourceType === 'raw' ? `${id}.${request.extension}` : id,
      overwrite: false,
      unique_filename: false,
      use_filename: false,
      timeout: UPLOAD_TIMEOUT_MS[request.resourceType],
    };

    let result: UploadApiResponse;
    try {
      result =
        request.resourceType === 'video'
          ? await this.uploadLarge(client, request.localPath, {
              ...options,
              chunk_size: VIDEO_CHUNK_BYTES,
            })
          : await client.uploader.upload(request.localPath, options);
    } catch (error) {
      // Credentials are never part of the message; the SDK reports status and reason only.
      console.error(
        `[media] Cloudinary upload to ${folder} failed: ${describeCloudinaryError(error)}`
      );
      throw mediaUploadFailed();
    }

    if (!result?.public_id || !result.secure_url) {
      console.error(`[media] Cloudinary upload to ${folder} returned no public_id or URL`);
      throw mediaUploadFailed();
    }

    return {
      provider: this.provider,
      key: result.public_id,
      url: result.secure_url,
      bytes: typeof result.bytes === 'number' ? result.bytes : 0,
      width: typeof result.width === 'number' ? result.width : null,
      height: typeof result.height === 'number' ? result.height : null,
      durationSeconds: typeof result.duration === 'number' ? result.duration : null,
      thumbnailUrl:
        request.resourceType === 'video'
          ? client.url(result.public_id, {
              resource_type: 'video',
              format: 'jpg',
              secure: true,
              transformation: [{ start_offset: '0', width: 640, crop: 'limit' }],
            })
          : null,
    };
  }

  /**
   * `upload_large` reports through its callback; depending on the SDK version
   * it may also return a promise, which is silenced so a failure is reported
   * exactly once and never as an unhandled rejection.
   */
  private uploadLarge(
    client: typeof cloudinary,
    localPath: string,
    options: UploadApiOptions
  ): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const returned: unknown = client.uploader.upload_large(
        localPath,
        options,
        (error, result) => {
          if (error) reject(error);
          else if (result) resolve(result);
          else reject(new Error('Cloudinary returned an empty response'));
        }
      );
      if (returned instanceof Promise) returned.catch(() => undefined);
    });
  }

  async remove(file: StoredFileRef): Promise<void> {
    const client = this.client();
    let result: { result?: string } | undefined;
    try {
      result = await client.uploader.destroy(file.key, {
        resource_type: file.resourceType,
        type: 'upload',
        invalidate: true,
      });
    } catch (error) {
      throw new Error(`Cloudinary destroy failed: ${describeCloudinaryError(error)}`);
    }
    // "not found" means it is already gone, which is the state we wanted.
    if (result?.result !== 'ok' && result?.result !== 'not found') {
      throw new Error(`Cloudinary destroy returned "${result?.result ?? 'nothing'}"`);
    }
  }
}

// ── Wiring ──────────────────────────────────────────────

export const localMediaStorage = new LocalMediaStorage(env.STORAGE_ROOT_ABSOLUTE);

export const cloudinaryMediaStorage = new CloudinaryMediaStorage({
  cloudName: env.CLOUDINARY_CLOUD_NAME,
  apiKey: env.CLOUDINARY_API_KEY,
  apiSecret: env.CLOUDINARY_API_SECRET,
  folder: env.CLOUDINARY_FOLDER,
});

/** The driver new uploads go to, chosen by MEDIA_STORAGE. */
export const mediaStorage: MediaStorage =
  env.MEDIA_STORAGE === 'local' ? localMediaStorage : cloudinaryMediaStorage;

/** The driver holding an existing file, whichever driver is active for new uploads. */
export function storageFor(provider: StorageProvider): MediaStorage {
  return provider === StorageProvider.CLOUDINARY ? cloudinaryMediaStorage : localMediaStorage;
}

/** Temporary uploads older than this are leftovers of a crash and are swept. */
const STALE_UPLOAD_MS = 60 * 60 * 1000;

/**
 * Delete abandoned temporary uploads. Each request removes its own file when it
 * ends; this only catches what a crash or a killed process left behind.
 */
export async function sweepStaleUploads(now = Date.now()): Promise<number> {
  const entries = await fs.readdir(env.UPLOAD_TMP_DIR).catch(() => [] as string[]);
  let removed = 0;
  for (const name of entries) {
    const file = path.join(env.UPLOAD_TMP_DIR, name);
    try {
      const { mtimeMs, isFile } = await fs.stat(file).then((stat) => ({
        mtimeMs: stat.mtimeMs,
        isFile: stat.isFile(),
      }));
      if (isFile && now - mtimeMs > STALE_UPLOAD_MS) {
        await fs.rm(file, { force: true });
        removed += 1;
      }
    } catch {
      // Removed by its own request in the meantime.
    }
  }
  return removed;
}

export async function ensureStorageReady(): Promise<void> {
  await fs.mkdir(env.UPLOAD_TMP_DIR, { recursive: true });
  for (const category of MEDIA_CATEGORIES) {
    await fs.mkdir(localMediaStorage.directoryFor(category), { recursive: true });
  }
}
