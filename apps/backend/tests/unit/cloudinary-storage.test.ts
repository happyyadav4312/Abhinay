import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The Cloudinary driver, with the SDK mocked: no network, no account. What is
 * checked is what the driver asks Cloudinary to do and how it reacts to each
 * answer — the integration suites exercise the full flow on the LOCAL driver.
 */
const sdk = vi.hoisted(() => ({
  config: vi.fn(),
  upload: vi.fn(),
  uploadLarge: vi.fn(),
  destroy: vi.fn(),
  url: vi.fn(() => 'https://res.cloudinary.com/demo/video/upload/so_0,w_640/reel.jpg'),
}));

vi.mock('cloudinary', () => ({
  v2: {
    config: sdk.config,
    url: sdk.url,
    uploader: { upload: sdk.upload, upload_large: sdk.uploadLarge, destroy: sdk.destroy },
  },
}));

import { StorageProvider } from '@prisma/client';
import { CloudinaryMediaStorage } from '../../src/config/storage';
import { AppError } from '../../src/utils/errors';

const SECRET = 'super-secret-api-secret-value';

function driver(overrides: Partial<{ apiKey: string; apiSecret: string }> = {}) {
  return new CloudinaryMediaStorage({
    cloudName: 'duinyfucs',
    apiKey: '123456789012345',
    apiSecret: SECRET,
    folder: 'abhinay',
    ...overrides,
  });
}

const UPLOADED = {
  public_id: 'abhinay/resumes/0b0e0c1e-0000-4000-8000-000000000000.pdf',
  secure_url:
    'https://res.cloudinary.com/duinyfucs/raw/upload/v1/abhinay/resumes/0b0e0c1e-0000-4000-8000-000000000000.pdf',
  bytes: 2048,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('availability', () => {
  it('is unavailable without a key or secret, and then refuses to upload with 503', async () => {
    for (const storage of [driver({ apiKey: '' }), driver({ apiSecret: '' })]) {
      expect(storage.isAvailable()).toBe(false);
      const error = await storage
        .upload({ localPath: '/tmp/x', category: 'resumes', resourceType: 'raw', extension: 'pdf' })
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).statusCode).toBe(503);
    }
    expect(sdk.upload).not.toHaveBeenCalled();
  });

  it('configures the SDK once, over HTTPS, with the credentials it was given', async () => {
    sdk.upload.mockResolvedValue(UPLOADED);
    const storage = driver();
    await storage.upload({
      localPath: '/tmp/a',
      category: 'resumes',
      resourceType: 'raw',
      extension: 'pdf',
    });
    await storage.upload({
      localPath: '/tmp/b',
      category: 'resumes',
      resourceType: 'raw',
      extension: 'pdf',
    });
    expect(sdk.config).toHaveBeenCalledTimes(1);
    expect(sdk.config).toHaveBeenCalledWith({
      cloud_name: 'duinyfucs',
      api_key: '123456789012345',
      api_secret: SECRET,
      secure: true,
    });
  });
});

describe('upload', () => {
  it('puts each kind of file in its own subfolder of the abhinay folder, never overwriting', async () => {
    sdk.upload.mockResolvedValue({ ...UPLOADED, width: 512, height: 512 });

    const stored = await driver().upload({
      localPath: '/tmp/photo.webp',
      category: 'profile-photos',
      resourceType: 'image',
      extension: 'webp',
    });

    const [localPath, options] = sdk.upload.mock.calls[0];
    expect(localPath).toBe('/tmp/photo.webp');
    expect(options).toMatchObject({
      resource_type: 'image',
      type: 'upload',
      folder: 'abhinay/profile-photos',
      asset_folder: 'abhinay/profile-photos',
      overwrite: false,
      use_filename: false,
    });
    // A generated id, never the client's file name.
    expect(options.public_id).toMatch(/^[0-9a-f-]{36}$/);

    expect(stored).toMatchObject({
      provider: StorageProvider.CLOUDINARY,
      key: UPLOADED.public_id,
      url: UPLOADED.secure_url,
      width: 512,
      height: 512,
      thumbnailUrl: null,
    });
  });

  it('keeps the .pdf extension in the public id of raw files', async () => {
    sdk.upload.mockResolvedValue(UPLOADED);
    await driver().upload({
      localPath: '/tmp/cv',
      category: 'resumes',
      resourceType: 'raw',
      extension: 'pdf',
    });
    expect(sdk.upload.mock.calls[0][1]).toMatchObject({
      resource_type: 'raw',
      folder: 'abhinay/resumes',
    });
    expect(sdk.upload.mock.calls[0][1].public_id).toMatch(/^[0-9a-f-]{36}\.pdf$/);
  });

  it('sends videos in chunks and reports their duration and a thumbnail', async () => {
    sdk.uploadLarge.mockImplementation(
      (_path: string, _options: unknown, callback: (error: unknown, result: unknown) => void) => {
        callback(undefined, {
          public_id: 'abhinay/reels/r',
          secure_url: 'https://res.cloudinary.com/duinyfucs/video/upload/v1/abhinay/reels/r.mp4',
          bytes: 9_000_000,
          width: 1920,
          height: 1080,
          duration: 42.5,
        });
      }
    );

    const stored = await driver().upload({
      localPath: '/tmp/reel',
      category: 'reels',
      resourceType: 'video',
      extension: 'mp4',
    });

    expect(sdk.upload).not.toHaveBeenCalled();
    expect(sdk.uploadLarge.mock.calls[0][1]).toMatchObject({
      resource_type: 'video',
      folder: 'abhinay/reels',
      chunk_size: 20_000_000,
    });
    expect(stored.durationSeconds).toBe(42.5);
    expect(stored.thumbnailUrl).toContain('.jpg');
  });

  it('turns any provider failure into a 502 without logging the secret', async () => {
    const failures = [
      { error: { message: 'Invalid Signature', http_code: 401 } },
      { error: { message: 'File size too large', http_code: 400 } },
      { error: { message: 'Request Timeout', http_code: 499 } },
      new Error('getaddrinfo ENOTFOUND api.cloudinary.com'),
    ];

    for (const failure of failures) {
      sdk.upload.mockRejectedValueOnce(failure);
      const error = await driver()
        .upload({ localPath: '/tmp/x', category: 'resumes', resourceType: 'raw', extension: 'pdf' })
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).statusCode).toBe(502);
    }

    const logged = vi.mocked(console.error).mock.calls.flat().join('\n');
    expect(logged).not.toContain(SECRET);
    expect(logged).toContain('HTTP 401');
  });

  it('treats a response without a URL as a failure', async () => {
    sdk.upload.mockResolvedValueOnce({ public_id: 'x' });
    const error = await driver()
      .upload({ localPath: '/tmp/x', category: 'resumes', resourceType: 'raw', extension: 'pdf' })
      .catch((caught: unknown) => caught);
    expect((error as AppError).statusCode).toBe(502);
  });
});

describe('remove', () => {
  it('destroys with the matching resource type and purges the CDN copy', async () => {
    sdk.destroy.mockResolvedValue({ result: 'ok' });
    await driver().remove({ key: 'abhinay/reels/r', category: 'reels', resourceType: 'video' });
    expect(sdk.destroy).toHaveBeenCalledWith('abhinay/reels/r', {
      resource_type: 'video',
      type: 'upload',
      invalidate: true,
    });
  });

  it('accepts "not found" as already deleted, and throws on anything else', async () => {
    sdk.destroy.mockResolvedValueOnce({ result: 'not found' });
    await expect(
      driver().remove({ key: 'gone', category: 'resumes', resourceType: 'raw' })
    ).resolves.toBeUndefined();

    sdk.destroy.mockResolvedValueOnce({ result: 'error' });
    await expect(
      driver().remove({ key: 'x', category: 'resumes', resourceType: 'raw' })
    ).rejects.toThrow();

    sdk.destroy.mockRejectedValueOnce({ error: { message: 'Bad Gateway', http_code: 502 } });
    await expect(
      driver().remove({ key: 'x', category: 'resumes', resourceType: 'raw' })
    ).rejects.toThrow(/HTTP 502/);
  });
});
