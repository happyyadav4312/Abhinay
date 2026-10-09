import { expect, test, type Page } from '@playwright/test';

/**
 * Browser coverage of profile media (CV, portfolio photos). The API under test
 * runs with MEDIA_STORAGE=local from .env.test, so no Cloudinary account is
 * involved; the upload → link → display path is the same.
 */

const PASSWORD = 'correct horse battery staple';

/** A tiny but structurally valid PDF. */
const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n'
);

/** A 1×1 PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

function uniqueTag(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1_000_000).toString(36)}`;
}

async function registerThrough(page: Page, name: string) {
  await page.goto('/register');
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Email').fill(`media.${uniqueTag()}@example.test`);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirm password').fill(PASSWORD);
  await page.getByLabel('Professional role').selectOption('ACTOR');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL('/dashboard');
}

test.describe('Profile media', () => {
  test('upload a CV and a portfolio photo, see them publicly, then remove them', async ({
    page,
  }) => {
    await registerThrough(page, 'Meera Media');
    await page.goto('/profile/edit');

    // ── A file that is not a PDF is refused before any upload ──
    await page.getByLabel('Choose a PDF').setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('hello'),
    });
    await expect(page.getByText('Choose a PDF file.')).toBeVisible();

    // ── CV ──
    await page.getByLabel('Choose a PDF').setInputFiles({
      name: 'Meera CV.pdf',
      mimeType: 'application/pdf',
      buffer: PDF,
    });
    await page.getByRole('button', { name: 'Upload CV' }).click();
    await expect(page.getByText('CV uploaded.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Meera CV.pdf' })).toBeVisible();

    // ── Portfolio photo with a caption ──
    await page.getByLabel('Add a photo').setInputFiles({
      name: 'still.png',
      mimeType: 'image/png',
      buffer: PNG,
    });
    await page.getByLabel('Caption (optional)', { exact: true }).fill('On set — Kochi');
    await page.getByRole('button', { name: 'Add to portfolio' }).click();
    await expect(page.getByRole('img', { name: 'On set — Kochi' })).toBeVisible();
    await expect(page.getByText('(1 of 12)')).toBeVisible();

    // ── Instagram reel link: a bad link is refused, a real one is canonicalised ──
    await page.getByLabel('Instagram reel link').fill('https://www.youtube.com/watch?v=x');
    await page.getByRole('button', { name: 'Add Instagram reel' }).click();
    await expect(page.getByText(/Paste a link to an Instagram reel/)).toBeVisible();

    await page
      .getByLabel('Instagram reel link')
      .fill('https://instagram.com/reel/CZ9VsSUBomM/?igsh=tracking');
    await page.getByLabel('Reel caption (optional)').fill('Monologue');
    await page.getByRole('button', { name: 'Add Instagram reel' }).click();
    const reelCard = page.getByRole('link', { name: /Watch “Monologue” on Instagram/ });
    await expect(reelCard).toHaveAttribute('href', 'https://www.instagram.com/reel/CZ9VsSUBomM/');
    await expect(reelCard).toHaveAttribute('target', '_blank');

    // ── Public profile shows all three ──
    await page.goto('/profile');
    await expect(page.getByRole('link', { name: 'Meera CV.pdf' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'On set — Kochi' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Watch “Monologue” on Instagram/ })).toBeVisible();

    // ── Remove both ──
    await page.goto('/profile/edit');
    await page.getByRole('button', { name: 'Remove On set — Kochi' }).click();
    await page.getByRole('button', { name: 'Yes, remove' }).click();
    await expect(page.getByRole('img', { name: 'On set — Kochi' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Remove CV' }).click();
    await expect(page.getByText('CV removed.')).toBeVisible();
    await expect(page.getByText('No CV uploaded yet.')).toBeVisible();
  });
});
