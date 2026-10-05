import { expect, test, type Page } from '@playwright/test';

/**
 * Browser coverage of WBS 1.2.1 (casting role posting) and 1.2.2.1 (browse &
 * search), through the real Next.js client, Express API and `*_test` database.
 *
 * The E2E database is not emptied between runs, so every assertion keys off a
 * unique tag rather than assuming a list is empty.
 */

const PASSWORD = 'correct horse battery staple';

function uniqueTag(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1_000_000).toString(36)}`;
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

async function fillCastingForm(page: Page, title: string, seekingRole = 'ACTOR') {
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Casting for').selectOption(seekingRole);
  await page.getByLabel('Location').fill('Kochi, Kerala');
  await page.getByLabel('Compensation').fill('₹15,000 per shooting day');
  await page
    .getByLabel('Description')
    .fill('Meera uncovers a coastal land scam while her newspaper is being sold.');
  await page.getByLabel('Requirements').fill('Female, 25–32. Fluent in Malayalam and English.');
}

const ROLE_URL = /\/casting\/[0-9a-f-]{36}(\?.*)?$/;

test.describe('Casting marketplace', () => {
  test('a producer drafts, publishes, edits and closes a casting role', async ({ page }) => {
    const tag = uniqueTag();
    const title = `Lead Meera ${tag}`;
    await registerThrough(page, 'Priya Producer', 'PRODUCER');

    // The dashboard and header lead to casting.
    await page.getByRole('link', { name: 'Post a role' }).click();
    await expect(page).toHaveURL('/casting/create');

    // ── Draft ──
    await fillCastingForm(page, title);
    await page.getByRole('button', { name: 'Save as draft' }).click();
    await expect(page).toHaveURL(ROLE_URL);
    await expect(
      page.getByText('Saved as a draft. Only you can see it until you publish it.')
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.getByText('Draft', { exact: true })).toBeVisible();

    // ── Publish ──
    await page.getByRole('button', { name: 'Publish role' }).click();
    await expect(
      page.getByText('Published. Your casting role is now visible to everyone on Abhinay.')
    ).toBeVisible();
    await expect(page.getByText('Open', { exact: true })).toBeVisible();

    // ── Edit ──
    await page.getByRole('link', { name: 'Edit', exact: true }).click();
    await expect(page).toHaveURL(/\/edit$/);
    await expect(page.getByLabel('Title')).toHaveValue(title);
    await page.getByLabel('Title').fill(`${title} (revised)`);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Changes saved.')).toBeVisible();
    await expect(page.getByRole('heading', { name: `${title} (revised)` })).toBeVisible();

    // ── Listed while open ──
    const roleUrl = page.url().split('?')[0];
    await page.goto(`/casting?q=${tag}`);
    await expect(page.getByRole('link', { name: `${title} (revised)` })).toBeVisible();

    // ── Close, after an explicit confirmation ──
    await page.goto(roleUrl);
    await page.getByRole('button', { name: 'Close role' }).click();
    await expect(page.getByText('Close this role?')).toBeVisible();
    await page.getByRole('button', { name: 'Yes, close role' }).click();
    await expect(page.getByText('Closed. The role is no longer listed in search.')).toBeVisible();
    await expect(page.getByText(/This role is closed\./)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Edit', exact: true })).toHaveCount(0);

    // ── No longer listed ──
    await page.goto(`/casting?q=${tag}`);
    await expect(page.getByText('No open casting roles match your search.')).toBeVisible();

    // ── Still in My postings, with its status ──
    await page.goto('/casting/mine?status=CLOSED');
    await expect(page.getByRole('link', { name: `${title} (revised)` })).toBeVisible();
  });

  test('an actor finds an open role by search but cannot post, edit or see drafts', async ({
    page,
    context,
  }) => {
    const tag = uniqueTag();
    const openTitle = `Camera Operator Night Unit ${tag}`;
    const draftTitle = `Secret Draft ${tag}`;

    // Producer posts one open role and keeps one draft.
    await registerThrough(page, 'Dev Director', 'DIRECTOR');
    await page.goto('/casting/create');
    await fillCastingForm(page, openTitle, 'CAMERA_OPERATOR');
    await page.getByRole('button', { name: 'Publish role' }).click();
    await expect(page.getByText('Published.', { exact: false })).toBeVisible();
    const openUrl = page.url().split('?')[0];

    await page.goto('/casting/create');
    await fillCastingForm(page, draftTitle);
    await page.getByRole('button', { name: 'Save as draft' }).click();
    await expect(page.getByRole('heading', { name: draftTitle })).toBeVisible();
    const draftUrl = page.url().split('?')[0];

    // An actor, in a separate browser context.
    const actorContext = await context.browser()!.newContext();
    const actor = await actorContext.newPage();
    await registerThrough(actor, 'Asha Actor', 'ACTOR');

    await actor.getByRole('link', { name: 'Casting', exact: true }).click();
    await expect(actor).toHaveURL('/casting');
    await expect(actor.getByRole('heading', { name: 'Casting calls' })).toBeVisible();
    // Not a poster: no posting actions.
    await expect(actor.getByRole('link', { name: 'Post a role' })).toHaveCount(0);

    // Search by keyword, then narrow with filters.
    await actor.getByLabel('Search').fill(tag);
    await actor.getByRole('button', { name: 'Search' }).click();
    await expect(actor).toHaveURL(new RegExp(`q=${tag}`));
    await expect(actor.getByRole('link', { name: openTitle })).toBeVisible();
    await expect(actor.getByRole('link', { name: draftTitle })).toHaveCount(0);

    // Exact: the filter form's own label ("Filter casting roles") also contains "role".
    await actor.getByLabel('Role', { exact: true }).selectOption('EDITOR');
    await actor.getByRole('button', { name: 'Search' }).click();
    await expect(actor.getByText('No open casting roles match your search.')).toBeVisible();

    await actor.getByRole('link', { name: 'Clear filters' }).click();
    await expect(actor).toHaveURL('/casting');

    // The detail page shows the role and its poster, without owner controls.
    await actor.goto(openUrl);
    await expect(actor.getByRole('heading', { name: openTitle })).toBeVisible();
    await expect(actor.getByText('Casting for Camera Operator')).toBeVisible();
    await expect(actor.getByRole('link', { name: 'Dev Director' })).toBeVisible();
    await expect(actor.getByText('Manage this role')).toHaveCount(0);
    await expect(actor.getByRole('link', { name: 'Edit', exact: true })).toHaveCount(0);

    // Posting and editing are refused with an explanation, not a blank page.
    await actor.goto('/casting/create');
    await expect(
      actor.getByRole('heading', { name: 'Producers and directors only' })
    ).toBeVisible();
    await actor.goto(`${openUrl}/edit`);
    await expect(actor.getByRole('heading', { name: 'You can’t edit this role' })).toBeVisible();

    // A draft does not exist for anyone but its author.
    await actor.goto(draftUrl);
    await expect(actor.getByRole('heading', { name: 'Casting role not found' })).toBeVisible();
    await expect(actor.getByText(draftTitle)).toHaveCount(0);

    await actorContext.close();
  });

  test('the form validates on the client and a draft can be deleted', async ({ page }) => {
    const tag = uniqueTag();
    await registerThrough(page, 'Farah Filmmaker', 'PRODUCER');

    await page.goto('/casting/create');
    await page.getByRole('button', { name: 'Save as draft' }).click();
    await expect(page.getByText('Title must be at least 3 characters')).toBeVisible();
    await expect(page.getByText('Location is required')).toBeVisible();
    await expect(page.getByText('Description is required')).toBeVisible();
    await expect(page).toHaveURL('/casting/create');

    await fillCastingForm(page, `Throwaway ${tag}`);
    await page.getByRole('button', { name: 'Save as draft' }).click();
    await expect(page.getByRole('heading', { name: `Throwaway ${tag}` })).toBeVisible();

    await page.getByRole('button', { name: 'Delete draft' }).click();
    await page.getByRole('button', { name: 'Yes, delete draft' }).click();
    await expect(page).toHaveURL('/casting/mine?notice=deleted');
    await expect(page.getByText('Draft deleted.')).toBeVisible();
    await expect(page.getByText('You have not posted any casting roles yet.')).toBeVisible();
  });
});
