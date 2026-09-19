import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { env } from './env';

/** The only URL path from which processed profile images are served. */
export const PUBLIC_MEDIA_PATH = '/media/profile-photos';

/** Subdirectory of STORAGE_ROOT holding served images. */
const PROFILE_PHOTO_DIR = 'profile-photos';

/**
 * Minimal storage seam. A cloud adapter would implement this same interface;
 * nothing outside this module knows the files live on a local disk.
 * Integrating an actual cloud provider is out of scope for Weeks 1-5.
 */
export interface ProfilePhotoStorage {
  /** Persist processed bytes and return the opaque key to store on the profile. */
  save(bytes: Buffer, extension: string): Promise<string>;
  /** Remove a previously saved object. Missing objects are not an error. */
  remove(key: string): Promise<void>;
  /** Absolute directory served read-only over PUBLIC_MEDIA_PATH. */
  publicDirectory(): string;
}

/**
 * Storage keys are generated here and never derived from a client filename, so
 * `../../etc/passwd` style input has nothing to attach to. This guard is the
 * second line of defence for keys read back out of the database.
 */
function assertSafeKey(key: string): void {
  if (!/^[A-Za-z0-9_-]+\.(jpg|png|webp)$/.test(key)) {
    throw new Error('Refusing to operate on an unexpected storage key');
  }
}

class FilesystemProfilePhotoStorage implements ProfilePhotoStorage {
  private readonly directory: string;

  constructor(root: string) {
    this.directory = path.join(root, PROFILE_PHOTO_DIR);
  }

  publicDirectory(): string {
    return this.directory;
  }

  async save(bytes: Buffer, extension: string): Promise<string> {
    await fs.mkdir(this.directory, { recursive: true });
    const key = `${crypto.randomUUID()}.${extension}`;
    assertSafeKey(key);
    await fs.writeFile(this.resolveInside(key), bytes, { flag: 'wx' });
    return key;
  }

  async remove(key: string): Promise<void> {
    assertSafeKey(key);
    await fs.rm(this.resolveInside(key), { force: true });
  }

  /**
   * Resolve a key and prove the result is still inside the storage root before
   * any filesystem call touches it.
   */
  private resolveInside(key: string): string {
    const target = path.resolve(this.directory, key);
    const root = path.resolve(this.directory);
    if (target !== root && !target.startsWith(root + path.sep)) {
      throw new Error('Resolved storage path escapes the storage root');
    }
    return target;
  }
}

export const profilePhotoStorage: ProfilePhotoStorage = new FilesystemProfilePhotoStorage(
  env.STORAGE_ROOT_ABSOLUTE
);

export async function ensureStorageReady(): Promise<void> {
  await fs.mkdir(profilePhotoStorage.publicDirectory(), { recursive: true });
}
