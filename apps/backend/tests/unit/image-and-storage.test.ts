import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { processProfilePhoto, UPLOAD_POLICY } from '../../src/services/image.service';
import { photoUrlOf, toPhotoUrl, toPublicProfile } from '../../src/services/dto';
import { env } from '../../src/config/env';
import { Role, StorageProvider } from '@prisma/client';
import { AppError } from '../../src/utils/errors';

async function image(format: 'jpeg' | 'png' | 'webp' | 'gif', width = 900, height = 400) {
  return sharp({ create: { width, height, channels: 3, background: '#123456' } })
    .toFormat(format)
    .toBuffer();
}

describe('profile photo processing', () => {
  it('re-encodes accepted formats to a square WebP', async () => {
    for (const format of ['jpeg', 'png', 'webp'] as const) {
      const result = await processProfilePhoto(await image(format));
      expect(result.extension).toBe('webp');

      const meta = await sharp(result.bytes).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.width).toBe(UPLOAD_POLICY.OUTPUT_SIZE);
      expect(meta.height).toBe(UPLOAD_POLICY.OUTPUT_SIZE);
    }
  });

  it('decides by decoding, not by the declared type', async () => {
    // Real GIF, correct magic bytes, but not on the allowlist.
    await expect(processProfilePhoto(await image('gif'))).rejects.toBeInstanceOf(AppError);

    // A shell script is not an image no matter what it is called.
    await expect(processProfilePhoto(Buffer.from('#!/bin/sh\nrm -rf /\n'))).rejects.toBeInstanceOf(
      AppError
    );

    // SVG can carry script and is never accepted.
    await expect(
      processProfilePhoto(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'))
    ).rejects.toBeInstanceOf(AppError);

    await expect(processProfilePhoto(Buffer.alloc(0))).rejects.toBeInstanceOf(AppError);
  });

  it('rejects oversized byte counts and oversized dimensions', async () => {
    await expect(
      processProfilePhoto(Buffer.alloc(UPLOAD_POLICY.MAX_BYTES + 1, 1))
    ).rejects.toMatchObject({ statusCode: 413 });

    const huge = await image('png', UPLOAD_POLICY.MAX_DIMENSION + 1, 10);
    await expect(processProfilePhoto(huge)).rejects.toMatchObject({ statusCode: 413 });
  });

  it('strips metadata from the re-encoded output', async () => {
    const withExif = await sharp({
      create: { width: 300, height: 300, channels: 3, background: '#abcdef' },
    })
      .withMetadata({ exif: { IFD0: { Copyright: 'attacker' } } })
      .jpeg()
      .toBuffer();

    const processed = await processProfilePhoto(withExif);
    const meta = await sharp(processed.bytes).metadata();
    expect(meta.exif).toBeUndefined();
  });
});

describe('photo URLs', () => {
  it('are built from configuration, not from a request Host header', () => {
    expect(toPhotoUrl('abc.webp')).toBe(`${env.PUBLIC_SERVER_URL}/media/profile-photos/abc.webp`);
    expect(toPhotoUrl(null)).toBeNull();
  });

  it('prefer the stored delivery URL and fall back to the local key for older photos', () => {
    const cloud = 'https://res.cloudinary.com/demo/image/upload/v1/abhinay/profile-photos/x.webp';
    expect(photoUrlOf({ profileImage: 'abhinay/profile-photos/x', profileImageUrl: cloud })).toBe(
      cloud
    );
    expect(photoUrlOf({ profileImage: 'legacy.webp', profileImageUrl: null })).toBe(
      `${env.PUBLIC_SERVER_URL}/media/profile-photos/legacy.webp`
    );
    expect(photoUrlOf({ profileImage: null, profileImageUrl: cloud })).toBeNull();
    expect(photoUrlOf(null)).toBeNull();
  });
});

describe('public profile projection', () => {
  it('omits email, phone, storage keys and every user-table secret', () => {
    const now = new Date();
    const projected = toPublicProfile({
      id: 'profile-1',
      userId: 'user-1',
      bio: 'A bio',
      location: 'Pune',
      phone: '+91 90000 00000',
      profileImage: 'k.webp',
      profileImageUrl: null,
      profileImageProvider: StorageProvider.LOCAL,
      resumeKey: 'abhinay/resumes/secret-key.pdf',
      resumeUrl: 'https://res.cloudinary.com/demo/raw/upload/v1/abhinay/resumes/cv.pdf',
      resumeProvider: StorageProvider.CLOUDINARY,
      resumeFileName: 'cv.pdf',
      resumeBytes: 1234,
      resumeUploadedAt: now,
      createdAt: now,
      updatedAt: now,
      portfolio: [],
      user: {
        id: 'user-1',
        name: 'Public Name',
        email: 'private@example.test',
        passwordHash: '$2b$12$notarealhash',
        role: Role.PRODUCER,
        createdAt: now,
        updatedAt: now,
      },
      skills: [],
      experiences: [],
    });

    expect(projected).not.toHaveProperty('email');
    expect(projected).not.toHaveProperty('phone');
    expect(projected).not.toHaveProperty('userId');

    const serialized = JSON.stringify(projected);
    expect(serialized).not.toContain('private@example.test');
    expect(serialized).not.toContain('$2b$12$notarealhash');
    expect(serialized).not.toContain('+91 90000 00000');

    // Only delivery URLs leave the server, never storage keys or providers.
    expect(serialized).not.toContain('secret-key');
    expect(serialized).not.toContain('CLOUDINARY');
    expect(projected.resume).toEqual({
      url: 'https://res.cloudinary.com/demo/raw/upload/v1/abhinay/resumes/cv.pdf',
      fileName: 'cv.pdf',
      bytes: 1234,
      uploadedAt: now.toISOString(),
    });
  });
});
