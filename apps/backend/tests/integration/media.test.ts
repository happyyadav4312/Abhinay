import fs from 'fs/promises';
import path from 'path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import { PortfolioMediaKind, StorageProvider } from '@prisma/client';
import app from '../../src/app';
import { prisma } from '../../src/config/database';
import { env } from '../../src/config/env';
import { localMediaStorage, mediaStorage, MediaCategory } from '../../src/config/storage';
import { LIMITS } from '../../src/validators/common';
import { bearer, disconnect, registerUser, resetDatabase } from '../helpers';

/**
 * Profile media through the real HTTP stack, on the LOCAL driver (MEDIA_STORAGE
 * =local in .env.test). The Cloudinary driver is the same interface and has its
 * own unit tests; here the provider is made to fail with spies to prove what
 * the service does about it.
 */

const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n'
);

function mp4(): Buffer {
  const header = Buffer.alloc(64);
  header.writeUInt32BE(24, 0);
  header.write('ftyp', 4, 'latin1');
  header.write('isom', 8, 'latin1');
  return header;
}

async function jpeg(width = 1200, height = 800): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#224466' } })
    .jpeg()
    .toBuffer();
}

async function storedFiles(category: MediaCategory): Promise<string[]> {
  return fs.readdir(localMediaStorage.directoryFor(category)).catch(() => []);
}

async function tempFiles(): Promise<string[]> {
  return fs.readdir(env.UPLOAD_TMP_DIR).catch(() => []);
}

/** The request is answered and nothing it wrote to the temporary directory survives. */
async function expectNoTempFiles(): Promise<void> {
  await expect.poll(tempFiles).toHaveLength(0);
}

beforeEach(async () => {
  await resetDatabase();
  for (const category of ['resumes', 'portfolio-photos', 'reels', 'profile-photos'] as const) {
    await fs.rm(localMediaStorage.directoryFor(category), { recursive: true, force: true });
  }
  await fs.rm(env.UPLOAD_TMP_DIR, { recursive: true, force: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(disconnect);

// ── CV ──────────────────────────────────────────────────

describe('CV upload', () => {
  it('stores a PDF, records only its link, and shows it on the public profile', async () => {
    const user = await registerUser(app);

    const res = await request(app)
      .post('/api/v1/profile/resume')
      .set(bearer(user.accessToken))
      .attach('resume', PDF, { filename: 'Meera Nair CV.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(200);
    const resume = res.body.data.profile.resume;
    expect(resume).toMatchObject({ fileName: 'Meera Nair CV.pdf', bytes: PDF.length });
    expect(resume.url.startsWith(`${env.PUBLIC_SERVER_URL}/media/resumes/`)).toBe(true);

    // The database holds a link and a generated key — never the bytes, never the client's name.
    const row = await prisma.profile.findUniqueOrThrow({ where: { userId: user.userId } });
    expect(row.resumeProvider).toBe(StorageProvider.LOCAL);
    expect(row.resumeKey).toMatch(/^[0-9a-f-]{36}\.pdf$/);
    expect(row.resumeUrl).toBe(resume.url);

    // Served unaltered.
    const served = await request(app).get(new URL(resume.url).pathname);
    expect(served.status).toBe(200);
    expect(Buffer.from(served.body).equals(PDF)).toBe(true);

    const publicView = await request(app).get(`/api/v1/profile/${user.profileId}`);
    expect(publicView.body.data.profile.resume.url).toBe(resume.url);
    // Only the delivery URL leaves the server: no storage key or provider fields.
    expect(Object.keys(publicView.body.data.profile.resume).sort()).toEqual([
      'bytes',
      'fileName',
      'uploadedAt',
      'url',
    ]);
    expect(JSON.stringify(publicView.body)).not.toContain('LOCAL');

    await expectNoTempFiles();
  });

  it('replaces the previous CV and deletes its file; removal is safe to repeat', async () => {
    const user = await registerUser(app);
    const upload = () =>
      request(app)
        .post('/api/v1/profile/resume')
        .set(bearer(user.accessToken))
        .attach('resume', PDF, { filename: 'cv.pdf', contentType: 'application/pdf' });

    await upload();
    const first = (await storedFiles('resumes'))[0];
    await upload();

    const files = await storedFiles('resumes');
    expect(files).toHaveLength(1);
    expect(files).not.toContain(first);

    const removed = await request(app)
      .delete('/api/v1/profile/resume')
      .set(bearer(user.accessToken));
    expect(removed.status).toBe(200);
    expect(removed.body.data.profile.resume).toBeNull();
    expect(await storedFiles('resumes')).toHaveLength(0);

    const again = await request(app).delete('/api/v1/profile/resume').set(bearer(user.accessToken));
    expect(again.status).toBe(200);
  });

  it('rejects disguised, truncated, wrong-type, oversized, missing and anonymous uploads', async () => {
    const user = await registerUser(app);
    const send = (bytes: Buffer, contentType: string, filename = 'cv.pdf') =>
      request(app)
        .post('/api/v1/profile/resume')
        .set(bearer(user.accessToken))
        .attach('resume', bytes, { filename, contentType });

    // A script wearing a PDF name and MIME type.
    expect((await send(Buffer.from('#!/bin/sh\necho pwned\n'), 'application/pdf')).status).toBe(
      415
    );
    // Cut off before the end marker.
    expect((await send(PDF.subarray(0, 30), 'application/pdf')).status).toBe(415);
    // Not on the allowlist at all.
    expect((await send(PDF, 'application/msword', 'cv.doc')).status).toBe(400);
    // Larger than 5 MiB.
    const huge = Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024)]);
    expect((await send(huge, 'application/pdf')).status).toBe(413);
    // No file.
    expect(
      (await request(app).post('/api/v1/profile/resume').set(bearer(user.accessToken))).status
    ).toBe(400);
    // No session: refused before anything is written.
    expect(
      (
        await request(app)
          .post('/api/v1/profile/resume')
          .attach('resume', PDF, { filename: 'cv.pdf', contentType: 'application/pdf' })
      ).status
    ).toBe(401);

    expect(await storedFiles('resumes')).toHaveLength(0);
    const row = await prisma.profile.findUniqueOrThrow({ where: { userId: user.userId } });
    expect(row.resumeKey).toBeNull();
    await expectNoTempFiles();
  });
});

// ── Portfolio ───────────────────────────────────────────

describe('portfolio photos', () => {
  it('adds a re-encoded photo with a caption, lists it publicly, and deletes it with its file', async () => {
    const user = await registerUser(app);

    const added = await request(app)
      .post('/api/v1/profile/portfolio/photos')
      .set(bearer(user.accessToken))
      .field('title', '  On set — Kochi  ')
      .attach('photo', await jpeg(), { filename: 'still.jpg', contentType: 'image/jpeg' });

    expect(added.status).toBe(201);
    const item = added.body.data.item;
    expect(item).toMatchObject({
      kind: 'PHOTO',
      title: 'On set — Kochi',
      width: 1200,
      height: 800,
    });
    expect(item.url).toMatch(/\/media\/portfolio-photos\/[0-9a-f-]{36}\.webp$/);

    const served = await request(app).get(new URL(item.url).pathname);
    expect((await sharp(served.body).metadata()).format).toBe('webp');

    const publicView = await request(app).get(`/api/v1/profile/${user.profileId}`);
    expect(publicView.body.data.profile.portfolio).toEqual([item]);

    const deleted = await request(app)
      .delete(`/api/v1/profile/portfolio/${item.id}`)
      .set(bearer(user.accessToken));
    expect(deleted.status).toBe(204);
    expect(await storedFiles('portfolio-photos')).toHaveLength(0);
    expect(await prisma.portfolioItem.count()).toBe(0);
  });

  it('rejects a caption that is too long or extra form fields, without storing anything', async () => {
    const user = await registerUser(app);

    const longTitle = await request(app)
      .post('/api/v1/profile/portfolio/photos')
      .set(bearer(user.accessToken))
      .field('title', 'x'.repeat(LIMITS.PORTFOLIO_TITLE_MAX + 1))
      .attach('photo', await jpeg(), { filename: 'a.jpg', contentType: 'image/jpeg' });
    expect(longTitle.status).toBe(422);
    expect(longTitle.body.error.fieldErrors.title).toBeDefined();

    const extra = await request(app)
      .post('/api/v1/profile/portfolio/photos')
      .set(bearer(user.accessToken))
      .field('profileId', user.profileId)
      .attach('photo', await jpeg(), { filename: 'a.jpg', contentType: 'image/jpeg' });
    expect(extra.status).toBe(422);

    expect(await storedFiles('portfolio-photos')).toHaveLength(0);
    await expectNoTempFiles();
  });

  it('refuses a photo beyond the limit before uploading it', async () => {
    const user = await registerUser(app);
    await prisma.portfolioItem.createMany({
      data: Array.from({ length: LIMITS.PORTFOLIO_PHOTOS_MAX }, (_, index) => ({
        profileId: user.profileId,
        kind: PortfolioMediaKind.PHOTO,
        provider: StorageProvider.LOCAL,
        storageKey: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}.webp`,
        url: `${env.PUBLIC_SERVER_URL}/media/portfolio-photos/x${index}.webp`,
        bytes: 1,
      })),
    });
    const upload = vi.spyOn(mediaStorage, 'upload');

    const res = await request(app)
      .post('/api/v1/profile/portfolio/photos')
      .set(bearer(user.accessToken))
      .attach('photo', await jpeg(), { filename: 'a.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('LIMIT_EXCEEDED');
    expect(upload).not.toHaveBeenCalled();
    await expectNoTempFiles();
  });

  it('cannot delete another member’s item, and answers 404 for unknown ids', async () => {
    const owner = await registerUser(app);
    const other = await registerUser(app);

    const added = await request(app)
      .post('/api/v1/profile/portfolio/photos')
      .set(bearer(owner.accessToken))
      .attach('photo', await jpeg(), { filename: 'a.jpg', contentType: 'image/jpeg' });
    const itemId = added.body.data.item.id;

    const stolen = await request(app)
      .delete(`/api/v1/profile/portfolio/${itemId}`)
      .set(bearer(other.accessToken));
    expect(stolen.status).toBe(404);
    expect(await storedFiles('portfolio-photos')).toHaveLength(1);

    for (const id of ['00000000-0000-4000-8000-000000000000', 'not-a-uuid']) {
      const res = await request(app)
        .delete(`/api/v1/profile/portfolio/${id}`)
        .set(bearer(owner.accessToken));
      expect(res.status).toBe(404);
    }
  });
});

describe('reels', () => {
  it('stores an MP4 as uploaded and lists it as a video', async () => {
    const user = await registerUser(app);

    const res = await request(app)
      .post('/api/v1/profile/portfolio/videos')
      .set(bearer(user.accessToken))
      .field('title', 'Showreel 2026')
      .attach('video', mp4(), { filename: 'reel.mp4', contentType: 'video/mp4' });

    expect(res.status).toBe(201);
    expect(res.body.data.item).toMatchObject({ kind: 'VIDEO', title: 'Showreel 2026' });
    expect(res.body.data.item.url).toMatch(/\/media\/reels\/[0-9a-f-]{36}\.mp4$/);
    expect(await storedFiles('reels')).toHaveLength(1);
    await expectNoTempFiles();
  });

  it('rejects an image or a script posing as a video', async () => {
    const user = await registerUser(app);
    for (const bytes of [await jpeg(), Buffer.from('#!/bin/sh\necho pwned\n')]) {
      const res = await request(app)
        .post('/api/v1/profile/portfolio/videos')
        .set(bearer(user.accessToken))
        .attach('video', bytes, { filename: 'reel.mp4', contentType: 'video/mp4' });
      expect(res.status).toBe(415);
    }
    expect(await storedFiles('reels')).toHaveLength(0);
  });

  it('deletes a reel that turns out to be too long, and stores no row', async () => {
    const user = await registerUser(app);
    const remove = vi.spyOn(localMediaStorage, 'remove');
    vi.spyOn(mediaStorage, 'upload').mockResolvedValueOnce({
      provider: StorageProvider.LOCAL,
      key: '11111111-1111-4111-8111-111111111111.mp4',
      url: `${env.PUBLIC_SERVER_URL}/media/reels/11111111-1111-4111-8111-111111111111.mp4`,
      bytes: 64,
      width: 1920,
      height: 1080,
      durationSeconds: 600,
      thumbnailUrl: null,
    });

    const res = await request(app)
      .post('/api/v1/profile/portfolio/videos')
      .set(bearer(user.accessToken))
      .attach('video', mp4(), { filename: 'long.mp4', contentType: 'video/mp4' });

    expect(res.status).toBe(422);
    expect(res.body.error.fieldErrors.video[0]).toMatch(/at most 3 minutes/);
    expect(remove).toHaveBeenCalledWith(
      expect.objectContaining({
        key: '11111111-1111-4111-8111-111111111111.mp4',
        category: 'reels',
      })
    );
    expect(await prisma.portfolioItem.count()).toBe(0);
    await expectNoTempFiles();
  });
});

// ── Failure handling ────────────────────────────────────

describe('when storage misbehaves', () => {
  it('answers 503 and stores nothing when the provider is not configured', async () => {
    const user = await registerUser(app);
    vi.spyOn(mediaStorage, 'isAvailable').mockReturnValue(false);
    const upload = vi.spyOn(mediaStorage, 'upload');

    const res = await request(app)
      .post('/api/v1/profile/resume')
      .set(bearer(user.accessToken))
      .attach('resume', PDF, { filename: 'cv.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('MEDIA_STORAGE_UNAVAILABLE');
    expect(upload).not.toHaveBeenCalled();
    await expectNoTempFiles();
  });

  it('keeps the existing photo when the provider rejects a new one', async () => {
    const user = await registerUser(app);
    const first = await request(app)
      .post('/api/v1/profile/photo')
      .set(bearer(user.accessToken))
      .attach('photo', await jpeg(), { filename: 'a.jpg', contentType: 'image/jpeg' });
    const goodUrl = first.body.data.profile.photoUrl;

    const { mediaUploadFailed } = await import('../../src/utils/errors');
    vi.spyOn(mediaStorage, 'upload').mockRejectedValueOnce(mediaUploadFailed());

    const failed = await request(app)
      .post('/api/v1/profile/photo')
      .set(bearer(user.accessToken))
      .attach('photo', await jpeg(), { filename: 'b.jpg', contentType: 'image/jpeg' });

    expect(failed.status).toBe(502);
    expect(failed.body.error.code).toBe('MEDIA_UPLOAD_FAILED');

    const me = await request(app).get('/api/v1/profile/me').set(bearer(user.accessToken));
    expect(me.body.data.profile.photoUrl).toBe(goodUrl);
    expect(await storedFiles('profile-photos')).toHaveLength(1);
    await expectNoTempFiles();
  });

  it('deletes the uploaded copy when the database write fails afterwards', async () => {
    const user = await registerUser(app);
    const remove = vi.spyOn(localMediaStorage, 'remove');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    // vi.spyOn cannot be undone on the Prisma client (its methods come through a
    // proxy, not the prototype), so swap the method by hand and put it back.
    const original = prisma.$transaction;
    Object.defineProperty(prisma, '$transaction', {
      configurable: true,
      writable: true,
      value: () => Promise.reject(new Error('database went away')),
    });
    let res: request.Response;
    try {
      res = await request(app)
        .post('/api/v1/profile/resume')
        .set(bearer(user.accessToken))
        .attach('resume', PDF, { filename: 'cv.pdf', contentType: 'application/pdf' });
    } finally {
      Object.defineProperty(prisma, '$transaction', {
        configurable: true,
        writable: true,
        value: original,
      });
    }

    expect(res.status).toBe(500);
    expect(remove).toHaveBeenCalledWith(expect.objectContaining({ category: 'resumes' }));
    expect(await storedFiles('resumes')).toHaveLength(0);
    const row = await prisma.profile.findUniqueOrThrow({ where: { userId: user.userId } });
    expect(row.resumeKey).toBeNull();
    await expectNoTempFiles();
  });

  it('still succeeds when the replaced file cannot be deleted, and logs it', async () => {
    const user = await registerUser(app);
    const upload = () =>
      request(app)
        .post('/api/v1/profile/resume')
        .set(bearer(user.accessToken))
        .attach('resume', PDF, { filename: 'cv.pdf', contentType: 'application/pdf' });

    await upload();
    vi.spyOn(localMediaStorage, 'remove').mockRejectedValueOnce(new Error('provider timeout'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const res = await upload();
    expect(res.status).toBe(200);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('provider timeout'));
  });
});

describe('Instagram reel links', () => {
  const REEL = 'https://www.instagram.com/reel/CZ9VsSUBomM/';
  const addLink = (token: string, body: object) =>
    request(app).post('/api/v1/profile/portfolio/links').set(bearer(token)).send(body);

  it('stores the canonical link as an EXTERNAL item and shows it on the public profile', async () => {
    const user = await registerUser(app);

    const res = await addLink(user.accessToken, {
      url: 'https://instagram.com/reel/CZ9VsSUBomM/?igsh=tracking',
      title: 'Dance reel',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.item).toMatchObject({
      kind: 'LINK',
      url: REEL,
      title: 'Dance reel',
      thumbnailUrl: null,
    });
    const row = await prisma.portfolioItem.findFirstOrThrow();
    expect(row).toMatchObject({ provider: StorageProvider.EXTERNAL, storageKey: REEL });

    const publicView = await request(app).get(`/api/v1/profile/${user.profileId}`);
    expect(publicView.body.data.profile.portfolio).toEqual([res.body.data.item]);
  });

  it('works without media storage, since nothing is uploaded', async () => {
    const user = await registerUser(app);
    vi.spyOn(mediaStorage, 'isAvailable').mockReturnValue(false);
    const upload = vi.spyOn(mediaStorage, 'upload');

    expect((await addLink(user.accessToken, { url: REEL })).status).toBe(201);
    expect(upload).not.toHaveBeenCalled();
  });

  it('refuses other sites, scripts, duplicates and a seventh link', async () => {
    const user = await registerUser(app);

    for (const url of [
      'javascript:alert(1)',
      'https://instagram.com.evil.example/reel/CZ9VsSUBomM/',
      'https://www.instagram.com/madhuridixitnene/',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    ]) {
      const res = await addLink(user.accessToken, { url });
      expect(res.status, url).toBe(422);
      expect(res.body.error.fieldErrors.url).toBeDefined();
    }
    expect((await addLink(user.accessToken, { url: REEL, kind: 'PHOTO' })).status).toBe(422);

    await addLink(user.accessToken, { url: REEL });
    const duplicate = await addLink(user.accessToken, {
      url: 'https://www.instagram.com/someone/reel/CZ9VsSUBomM/?utm_source=x',
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('ALREADY_IN_PORTFOLIO');

    for (const code of [
      'CZ6vPjjhRHt',
      'CYMTXE0IqpP',
      'CXVTbACA8m5',
      'CXGvkOMAKlU',
      'CW-mG8VAIg8',
    ]) {
      expect(
        (await addLink(user.accessToken, { url: `https://www.instagram.com/reel/${code}/` })).status
      ).toBe(201);
    }
    const seventh = await addLink(user.accessToken, {
      url: 'https://www.instagram.com/reel/CW0tKMjgcAh/',
    });
    expect(seventh.status).toBe(422);
    expect(seventh.body.error.code).toBe('LIMIT_EXCEEDED');

    // Links count separately from uploaded reels and photos.
    expect(await prisma.portfolioItem.count({ where: { kind: PortfolioMediaKind.LINK } })).toBe(
      LIMITS.PORTFOLIO_LINKS_MAX
    );
  });

  it('requires a session', async () => {
    expect(
      (await request(app).post('/api/v1/profile/portfolio/links').send({ url: REEL })).status
    ).toBe(401);
  });

  it('deleting a link or an external photo never calls a storage driver', async () => {
    const user = await registerUser(app);
    const linkId = (await addLink(user.accessToken, { url: REEL })).body.data.item.id;
    const localRemove = vi.spyOn(localMediaStorage, 'remove');
    const { cloudinaryMediaStorage } = await import('../../src/config/storage');
    const cloudRemove = vi.spyOn(cloudinaryMediaStorage, 'remove');

    const deleted = await request(app)
      .delete(`/api/v1/profile/portfolio/${linkId}`)
      .set(bearer(user.accessToken));
    expect(deleted.status).toBe(204);

    // A demo avatar hosted on Unsplash, then replaced by a real upload.
    const unsplash = 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=512';
    await prisma.profile.update({
      where: { userId: user.userId },
      data: {
        profileImage: unsplash,
        profileImageUrl: unsplash,
        profileImageProvider: StorageProvider.EXTERNAL,
      },
    });
    expect(
      (await request(app).get(`/api/v1/profile/${user.profileId}`)).body.data.profile.photoUrl
    ).toBe(unsplash);
    await request(app)
      .post('/api/v1/profile/photo')
      .set(bearer(user.accessToken))
      .attach('photo', await jpeg(), { filename: 'new.jpg', contentType: 'image/jpeg' });

    expect(localRemove).not.toHaveBeenCalled();
    expect(cloudRemove).not.toHaveBeenCalled();
  });
});

describe('photos stored before Cloudinary', () => {
  it('still resolve from their local key, and are deleted from local storage on replacement', async () => {
    const user = await registerUser(app);
    const legacyKey = '22222222-2222-4222-8222-222222222222.webp';
    const directory = localMediaStorage.directoryFor('profile-photos');
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, legacyKey), await jpeg(10, 10));
    // Exactly what the migration's backfill leaves: key and LOCAL provider, no URL.
    await prisma.profile.update({
      where: { userId: user.userId },
      data: { profileImage: legacyKey, profileImageProvider: StorageProvider.LOCAL },
    });

    const before = await request(app).get(`/api/v1/profile/${user.profileId}`);
    expect(before.body.data.profile.photoUrl).toBe(
      `${env.PUBLIC_SERVER_URL}/media/profile-photos/${legacyKey}`
    );

    await request(app)
      .post('/api/v1/profile/photo')
      .set(bearer(user.accessToken))
      .attach('photo', await jpeg(), { filename: 'new.jpg', contentType: 'image/jpeg' });

    expect(await storedFiles('profile-photos')).not.toContain(legacyKey);
  });
});

describe('temporary uploads', () => {
  it('are never served over HTTP', async () => {
    await fs.mkdir(env.UPLOAD_TMP_DIR, { recursive: true });
    const secret = path.join(env.UPLOAD_TMP_DIR, 'secret.upload');
    await fs.writeFile(secret, 'private');
    try {
      for (const url of ['/media/tmp-uploads/secret.upload', '/media/secret.upload']) {
        expect((await request(app).get(url)).status).toBe(404);
      }
    } finally {
      await fs.rm(secret, { force: true });
    }
  });

  it('left behind by a crash are swept once they are an hour old', async () => {
    const { sweepStaleUploads } = await import('../../src/config/storage');
    await fs.mkdir(env.UPLOAD_TMP_DIR, { recursive: true });
    const stale = path.join(env.UPLOAD_TMP_DIR, 'stale.upload');
    const fresh = path.join(env.UPLOAD_TMP_DIR, 'fresh.upload');
    await fs.writeFile(stale, 'x');
    await fs.writeFile(fresh, 'x');
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await fs.utimes(stale, twoHoursAgo, twoHoursAgo);

    expect(await sweepStaleUploads()).toBe(1);
    expect(await tempFiles()).toEqual(['fresh.upload']);
    await fs.rm(fresh, { force: true });
  });
});
