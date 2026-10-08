import { expect, test, type Page } from '@playwright/test';

/**
 * Browser coverage of WBS 1.2.1 deadlines and 1.2.3 shortlist folders, through
 * the real Next.js client, Express API and `*_test` database. Assertions key off
 * a unique tag because the E2E database is not emptied between runs.
 */

const PASSWORD = 'correct horse battery staple';

function uniqueTag(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1_000_000).toString(36)}`;
}

/** `YYYY-MM-DD`, `days` from today in the local time zone. */
function dateFromToday(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** "22 Oct 2026", as the app prints calendar dates. */
function displayDate(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00.000Z`));
}

async function registerThrough(page: Page, name: string, role: string) {
  await page.goto('/register');
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Email').fill(`${role.toLowerCase()}.${uniqueTag()}@example.test`);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirm password').fill(PASSWORD);
  await page.getByLabel('Professional role').selectOption(role);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL('/dashboard');
}

test.describe('Deadlines and shortlists', () => {
  test('a producer sets a deadline, an actor applies, and the producer files them in folders', async ({
    page,
    context,
  }) => {
    const tag = uniqueTag();
    const title = `Supporting role ${tag}`;
    const deadline = dateFromToday(14);

    // ── Post with a deadline; a past date is refused on the client first ──
    await registerThrough(page, 'Farah Producer', 'PRODUCER');
    await page.goto('/casting/create');
    await page.getByLabel('Title').fill(title);
    await page.getByLabel('Casting for').selectOption('ACTOR');
    await page.getByLabel('Location').fill('Pune');
    await page.getByLabel('Compensation').fill('₹6,000 per day');
    await page.getByLabel('Description').fill('Short film, 5-day schedule.');
    await page.getByLabel('Requirements').fill('Comfortable with improvisation.');
    await page.getByLabel('Application deadline (optional)').fill(dateFromToday(-1));
    await page.getByRole('button', { name: 'Publish role' }).click();
    await expect(page.getByText('The deadline cannot be in the past')).toBeVisible();

    await page.getByLabel('Application deadline (optional)').fill(deadline);
    await page.getByRole('button', { name: 'Publish role' }).click();
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.getByText(displayDate(deadline))).toBeVisible();
    const roleUrl = page.url().split('?')[0];

    // ── An actor finds it sorted by deadline, and applies ──
    const actorContext = await context.browser()!.newContext();
    const actor = await actorContext.newPage();
    await registerThrough(actor, `Kabir Actor ${tag}`, 'ACTOR');
    await actor.goto(`/casting?q=${tag}&sort=deadline`);
    await expect(actor.getByLabel('Sort')).toHaveValue('deadline');
    await expect(actor.getByText(`Apply by ${displayDate(deadline)}`)).toBeVisible();
    await actor.getByRole('link', { name: title }).click();
    await actor.getByRole('button', { name: 'Apply for this role' }).click();
    await actor.getByRole('button', { name: 'Yes, apply' }).click();
    await expect(actor.getByText(/You applied on/)).toBeVisible();

    // The applicant list is the author's alone.
    await actor.goto(`${roleUrl}/applicants`);
    await expect(actor.getByRole('heading', { name: 'Applicants not available' })).toBeVisible();

    // ── The producer reviews applicants and creates a folder ──
    await page.goto(roleUrl);
    await page.getByRole('link', { name: 'Review applicants & shortlists' }).click();
    await expect(page.getByRole('heading', { name: 'Applicants' })).toBeVisible();
    await expect(page.getByRole('link', { name: `Kabir Actor ${tag}` })).toBeVisible();
    await expect(page.getByRole('link', { name: 'All applicants (1)' })).toBeVisible();

    await page.getByLabel('New folder').fill('Callbacks');
    await page.getByRole('button', { name: 'Create folder' }).click();
    await expect(page.getByRole('link', { name: 'Callbacks (0)' })).toBeVisible();

    // A duplicate name, in any casing, is refused with a message on the field.
    await page.getByLabel('New folder').fill('callbacks');
    await page.getByRole('button', { name: 'Create folder' }).click();
    await expect(
      page.getByText('A folder with this name already exists for this role')
    ).toBeVisible();

    // ── File the applicant, then filter by the folder ──
    const toggle = page.getByRole('button', { name: /Callbacks/ });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('link', { name: 'Callbacks (1)' })).toBeVisible();

    await page.getByRole('link', { name: 'Callbacks (1)' }).click();
    await expect(page).toHaveURL(/\?folder=/);
    await expect(page.getByRole('link', { name: `Kabir Actor ${tag}` })).toBeVisible();

    // Filing is organisation only: the application is still "Applied".
    await expect(page.getByText('Applied', { exact: true })).toBeVisible();

    // ── Rename, then delete; the applicant stays on the list ──
    await page.getByRole('button', { name: 'Rename folder' }).click();
    await page.getByLabel('Rename “Callbacks”').fill('Second round');
    await page.getByRole('button', { name: 'Save name' }).click();
    await expect(page.getByRole('link', { name: 'Second round (1)' })).toBeVisible();

    await page.getByRole('button', { name: 'Delete folder' }).click();
    await page.getByRole('button', { name: 'Yes, delete folder' }).click();
    await expect(page.getByRole('link', { name: /Second round/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: `Kabir Actor ${tag}` })).toBeVisible();

    await actorContext.close();
  });

  test('a role with no applicants shows an empty state', async ({ page }) => {
    const tag = uniqueTag();
    await registerThrough(page, 'Dev Director', 'DIRECTOR');
    await page.goto('/casting/create');
    await page.getByLabel('Title').fill(`Quiet role ${tag}`);
    await page.getByLabel('Location').fill('Chennai');
    await page.getByLabel('Compensation').fill('Credit and meals');
    await page.getByLabel('Description').fill('Student film.');
    await page.getByLabel('Requirements').fill('Any age.');
    await page.getByRole('button', { name: 'Publish role' }).click();
    await expect(page.getByRole('heading', { name: `Quiet role ${tag}` })).toBeVisible();
    await expect(page.getByText('No deadline')).toBeVisible();

    await page.getByRole('link', { name: 'Review applicants & shortlists' }).click();
    await expect(page.getByText('Nobody has applied to this role yet.')).toBeVisible();
  });
});
