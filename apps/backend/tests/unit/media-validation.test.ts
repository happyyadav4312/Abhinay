import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  assertPdf,
  detectVideo,
  displayFileName,
} from '../../src/services/media-validation.service';
import { PORTFOLIO_OUTPUT_MAX_SIDE, processPortfolioPhoto } from '../../src/services/image.service';
import { AppError } from '../../src/utils/errors';

let dir: string;

async function file(name: string, bytes: Buffer | string): Promise<string> {
  const target = path.join(dir, name);
  await fs.writeFile(target, bytes);
  return target;
}

/** The smallest structurally plausible PDF. */
const PDF = '%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n';

/** An `ftyp` box with the given brand, padded like a real file header. */
function ftyp(brand: string): Buffer {
  const header = Buffer.alloc(32);
  header.writeUInt32BE(24, 0);
  header.write('ftyp', 4, 'latin1');
  header.write(brand, 8, 'latin1');
  return header;
}

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'abhinay-media-'));
});

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('PDF check', () => {
  it('accepts a PDF with header and end marker, even with trailing whitespace', async () => {
    await expect(assertPdf(await file('ok.pdf', PDF))).resolves.toBeUndefined();
    await expect(assertPdf(await file('ws.pdf', `${PDF}\r\n\r\n`))).resolves.toBeUndefined();
  });

  it('rejects renamed, truncated and empty files with 415', async () => {
    for (const [name, bytes] of [
      ['script.pdf', '#!/bin/sh\necho pwned\n'],
      ['html.pdf', '<html><script>alert(1)</script></html>'],
      ['truncated.pdf', PDF.slice(0, 40)],
      ['empty.pdf', ''],
    ] as const) {
      const error = await assertPdf(await file(name, bytes)).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).statusCode).toBe(415);
    }
  });
});

describe('video check', () => {
  it('recognises MP4, MOV and WebM by signature', async () => {
    expect(await detectVideo(await file('a.mp4', ftyp('isom')))).toBe('mp4');
    expect(await detectVideo(await file('b.mp4', ftyp('mp42')))).toBe('mp4');
    expect(await detectVideo(await file('c.mov', ftyp('qt  ')))).toBe('mov');

    const webm = Buffer.concat([
      Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x84]),
      Buffer.from('webm', 'latin1'),
      Buffer.alloc(16),
    ]);
    expect(await detectVideo(await file('d.webm', webm))).toBe('webm');
  });

  it('rejects images in the same container, other formats and empty files', async () => {
    const cases: [string, Buffer][] = [
      // HEIF and AVIF photos use an ftyp box too; their brand gives them away.
      ['heic.mp4', ftyp('heic')],
      ['avif.mp4', ftyp('avif')],
      ['mkv.webm', Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from('matroska')])],
      ['text.mp4', Buffer.from('just some text pretending to be a video')],
      ['empty.mp4', Buffer.alloc(0)],
    ];
    for (const [name, bytes] of cases) {
      const error = await detectVideo(await file(name, bytes)).catch((caught: unknown) => caught);
      expect(error, name).toBeInstanceOf(AppError);
      expect((error as AppError).statusCode).toBe(415);
    }
  });
});

describe('portfolio photo processing', () => {
  it('scales a large image down to fit, keeps its aspect ratio, and re-encodes to WebP', async () => {
    const wide = await sharp({
      create: { width: 4000, height: 1000, channels: 3, background: '#335577' },
    })
      .png()
      .toBuffer();

    const result = await processPortfolioPhoto(wide);
    expect(result.extension).toBe('webp');
    expect(result.width).toBe(PORTFOLIO_OUTPUT_MAX_SIDE);
    expect(result.height).toBe(PORTFOLIO_OUTPUT_MAX_SIDE / 4);
  });

  it('never enlarges a small image', async () => {
    const small = await sharp({
      create: { width: 300, height: 200, channels: 3, background: '#335577' },
    })
      .jpeg()
      .toBuffer();
    const result = await processPortfolioPhoto(small);
    expect([result.width, result.height]).toEqual([300, 200]);
  });
});

describe('display file names', () => {
  it('drops path parts and control characters, and falls back when nothing is left', () => {
    expect(displayFileName('C:\\Users\\me\\My CV.pdf', 'resume.pdf')).toBe('My CV.pdf');
    expect(displayFileName('../../etc/passwd', 'resume.pdf')).toBe('passwd');
    expect(displayFileName('bad\u0000name\u0007.pdf', 'resume.pdf')).toBe('badname.pdf');
    expect(displayFileName('   ', 'resume.pdf')).toBe('resume.pdf');
    expect(displayFileName(undefined, 'resume.pdf')).toBe('resume.pdf');
  });

  it('repairs UTF-8 names that multer decoded as latin1, and caps the length', () => {
    const mangled = Buffer.from('अभिनय.pdf', 'utf8').toString('latin1');
    expect(displayFileName(mangled, 'resume.pdf')).toBe('अभिनय.pdf');
    expect(Array.from(displayFileName(`${'x'.repeat(300)}.pdf`, 'resume.pdf'))).toHaveLength(120);
  });
});
