import fs from 'fs/promises';
import path from 'path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import app from '../../src/app';
import { prisma } from '../../src/config/database';
import { env } from '../../src/config/env';
import { profilePhotoStorage } from '../../src/config/storage';
import { bearer, disconnect, registerUser, resetDatabase } from '../helpers';

const storageDir = profilePhotoStorage.publicDirectory();

/** Build a real, decodable image of the requested format and size. */
async function makeImage(
  format: 'jpeg' | 'png' | 'webp' | 'gif',
  width = 800,
  height = 600
): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 20, g: 120, b: 200 },
    },
  })
    .toFormat(format)
    .toBuffer();
}

async function storedFiles(): Promise<string[]> {
  return fs.readdir(storageDir).catch(() => []);
}

beforeEach(async () => {
  await resetDatabase();
  await fs.rm(storageDir, { recursive: true, force: true });
  await fs.mkdir(storageDir, { recursive: true });
});

afterAll(disconnect);

describe('POST /api/v1/profile/photo', () => {
  it('accepts a valid image, persists it, and serves it from the media path', async () => {
    const user = await registerUser(app);
    const image = await makeImage('jpeg');

    const res = await request(app)
      .post('/api/v1/profile/photo')
      .set(bearer(user.accessToken))
      .attach('photo', image, { filename: 'headshot.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);

    const photoUrl: string = res.body.data.profile.photoUrl;
    // The URL points at the Express media origin, not the Next.js origin, and
    // is not prefixed with /api.
    expect(photoUrl.startsWith(`${env.PUBLIC_SERVER_URL}/media/profile-photos/`)).toBe(true);
    expect(photoUrl).not.toContain('/api/');

    expect(await storedFiles()).toHaveLength(1);

    // The stored reference is an opaque key, never the client's filename.
    const profile = await prisma.profile.findUniqueOrThrow({ where: { userId: user.userId } });
    expect(profile.profileImage).not.toContain('headshot');
    expect(profile.profileImage).toMatch(/^[0-9a-f-]{36}\.webp$/);

    // It is actually reachable, and re-encoded rather than echoed back.
    const served = await request(app).get(new URL(photoUrl).pathname);
    expect(served.status).toBe(200);
    expect((await sharp(served.body).metadata()).format).toBe('webp');

    // A logged-out visitor sees it on the public profile too.
    const publicView = await request(app).get(`/api/v1/profile/${user.profileId}`);
    expect(publicView.body.data.profile.photoUrl).toBe(photoUrl);
  });

  it('replaces the previous image and removes the superseded file', async () => {
    const user = await registerUser(app);

    const first = await request(app)
      .post('/api/v1/profile/photo')
      .set(bearer(user.accessToken))
      .attach('photo', await makeImage('png'), { filename: 'a.png', contentType: 'image/png' });
    const firstKey = (await prisma.profile.findUniqueOrThrow({ where: { userId: user.userId } }))
      .profileImage;

    const second = await request(app)
      .post('/api/v1/profile/photo')
      .set(bearer(user.accessToken))
      .attach('photo', await makeImage('webp'), { filename: 'b.webp', contentType: 'image/webp' });

    expect(second.status).toBe(200);
    expect(second.body.data.profile.photoUrl).not.toBe(first.body.data.profile.photoUrl);

    const files = await storedFiles();
    expect(files).toHaveLength(1);
    expect(files).not.toContain(firstKey);
  });

  it('rejects unauthenticated, missing, malformed, disguised and disallowed uploads', async () => {
    const user = await registerUser(app);

    const anonymous = await request(app)
      .post('/api/v1/profile/photo')
      .attach('photo', await makeImage('jpeg'), { filename: 'a.jpg', contentType: 'image/jpeg' });
    expect(anonymous.status).toBe(401);

    const noFile = await request(app).post('/api/v1/profile/photo').set(bearer(user.accessToken));
    expect(noFile.status).toBe(400);

    // Plain text wearing an image/jpeg content type and a .jpg extension.
    const disguised = await request(app)
      .post('/api/v1/profile/photo')
      .set(bearer(user.accessToken))
      .attach('photo', Buffer.from('#!/bin/sh\necho pwned\n'), {
        filename: 'payload.jpg',
        contentType: 'image/jpeg',
      });
    expect(disguised.status).toBe(415);

    // SVG can carry script; it is not in the allowlist and does not decode.
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    );
    const svgAsJpeg = await request(app)
      .post('/api/v1/profile/photo')
      .set(bearer(user.accessToken))
      .attach('photo', svg, { filename: 'x.svg', contentType: 'image/jpeg' });
    expect(svgAsJpeg.status).toBe(415);

    // A genuine but disallowed format.
    const gif = await request(app)
      .post('/api/v1/profile/photo')
      .set(bearer(user.accessToken))
      .attach('photo', await makeImage('gif'), { filename: 'a.gif', contentType: 'image/gif' });
    expect(gif.status).toBe(400);

    // Truncated image data.
    const truncated = (await makeImage('png')).subarray(0, 64);
    const broken = await request(app)
      .post('/api/v1/profile/photo')
      .set(bearer(user.accessToken))
      .attach('photo', truncated, { filename: 'broken.png', contentType: 'image/png' });
    expect(broken.status).toBe(415);

    // Nothing reached the disk and no reference was stored.
    expect(await storedFiles()).toHaveLength(0);
    const profile = await prisma.profile.findUniqueOrThrow({ where: { userId: user.userId } });
    expect(profile.profileImage).toBeNull();
  });

  it('rejects an oversized upload', async () => {
    const user = await registerUser(app);
    const oversized = Buffer.alloc(6 * 1024 * 1024, 1);

    const res = await request(app)
      .post('/api/v1/profile/photo')
      .set(bearer(user.accessToken))
      .attach('photo', oversized, { filename: 'big.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(413);
    expect(await storedFiles()).toHaveLength(0);
  });

  it('cannot be tricked into writing outside the storage root via the filename', async () => {
    const user = await registerUser(app);

    const res = await request(app)
      .post('/api/v1/profile/photo')
      .set(bearer(user.accessToken))
      .attach('photo', await makeImage('png'), {
        filename: '../../../../escaped.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(200);

    // Exactly one file, inside the storage root, under a generated name.
    const files = await storedFiles();
    expect(files).toHaveLength(1);
    expect(files[0]).not.toContain('escaped');
    expect(files[0]).not.toContain('..');

    const escaped = path.resolve(storageDir, '..', '..', '..', '..', 'escaped.png');
    await expect(fs.access(escaped)).rejects.toThrow();
  });

  it('leaves the existing photo intact when a later upload fails', async () => {
    const user = await registerUser(app);

    await request(app)
      .post('/api/v1/profile/photo')
      .set(bearer(user.accessToken))
      .attach('photo', await makeImage('jpeg'), {
        filename: 'good.jpg',
        contentType: 'image/jpeg',
      });

    const goodKey = (await prisma.profile.findUniqueOrThrow({ where: { userId: user.userId } }))
      .profileImage;

    const failed = await request(app)
      .post('/api/v1/profile/photo')
      .set(bearer(user.accessToken))
      .attach('photo', Buffer.from('not an image at all'), {
        filename: 'bad.jpg',
        contentType: 'image/jpeg',
      });
    expect(failed.status).toBe(415);

    const after = await prisma.profile.findUniqueOrThrow({ where: { userId: user.userId } });
    expect(after.profileImage).toBe(goodKey);
    expect(await storedFiles()).toEqual([goodKey]);

    // Unrelated profile editing still works.
    const edit = await request(app)
      .put('/api/v1/profile/me')
      .set(bearer(user.accessToken))
      .send({ name: 'Unblocked', bio: null, location: null, phone: null });
    expect(edit.status).toBe(200);
    expect(edit.body.data.profile.photoUrl).toContain(goodKey as string);
  });
});

describe('DELETE /api/v1/profile/photo', () => {
  it('clears the reference, deletes the file, and is safe to repeat', async () => {
    const user = await registerUser(app);

    await request(app)
      .post('/api/v1/profile/photo')
      .set(bearer(user.accessToken))
      .attach('photo', await makeImage('png'), { filename: 'a.png', contentType: 'image/png' });

    const removed = await request(app)
      .delete('/api/v1/profile/photo')
      .set(bearer(user.accessToken));

    expect(removed.status).toBe(200);
    expect(removed.body.data.profile.photoUrl).toBeNull();
    expect(await storedFiles()).toHaveLength(0);

    const again = await request(app).delete('/api/v1/profile/photo').set(bearer(user.accessToken));
    expect(again.status).toBe(200);
  });

  it('requires authentication', async () => {
    expect((await request(app).delete('/api/v1/profile/photo')).status).toBe(401);
  });
});
