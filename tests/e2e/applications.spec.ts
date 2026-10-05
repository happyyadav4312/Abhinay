import { expect, test, type Page } from '@playwright/test';

/**
 * Browser coverage of WBS 1.2.2.2: applying to a casting role, through the real
 * Next.js client, Express API and `*_test` database. Every assertion keys off a
 * unique tag because the E2E database is not emptied between runs.
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

/** Post and publish a role from the create page; returns its URL without the notice. */
async function publishRole(page: Page, title: string, seekingRole: string): Promise<string> {
  await page.goto('/casting/create');
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Casting for').selectOption(seekingRole);
  await page.getByLabel('Location').fill('Mumbai');
  await page.getByLabel('Compensation').fill('₹8,000 per day');
  await page.getByLabel('Description').fill('Independent feature, 20-day schedule.');
  await page.getByLabel('Requirements').fill('Available through November.');
  await page.getByRole('button', { name: 'Publish role' }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  return page.url().split('?')[0];
}

test.describe('Applying to casting roles', () => {
  test('an actor applies to a matching role and tracks it; other professions cannot apply', async ({
    page,
    context,
  }) => {
    const tag = uniqueTag();
    const actorRoleTitle = `Lead Actor ${tag}`;
    const cameraRoleTitle = `Focus Puller ${tag}`;

    // A producer publishes one role for actors and one for camera operators.
    await registerThrough(page, 'Pooja Producer', 'PRODUCER');
    const actorRoleUrl = await publishRole(page, actorRoleTitle, 'ACTOR');
    const cameraRoleUrl = await publishRole(page, cameraRoleTitle, 'CAMERA_OPERATOR');

    // An actor, in a separate browser context.
    const actorContext = await context.browser()!.newContext();
    const actor = await actorContext.newPage();
    await registerThrough(actor, 'Arjun Actor', 'ACTOR');

    // ── Apply, after an explicit confirmation ──
    await actor.goto(actorRoleUrl);
    await expect(actor.getByRole('heading', { name: actorRoleTitle })).toBeVisible();
    await actor.getByRole('button', { name: 'Apply for this role' }).click();
    await expect(
      actor.getByText(`Apply for “${actorRoleTitle}” with your public profile?`)
    ).toBeVisible();
    await actor.getByRole('button', { name: 'Yes, apply' }).click();
    await expect(
      actor.getByText('Application sent. Pooja Producer can now see your profile.')
    ).toBeVisible();
    await expect(actor.getByText(/You applied on/)).toBeVisible();
    await expect(actor.getByRole('button', { name: 'Apply for this role' })).toHaveCount(0);

    // ── Persisted: a reload still shows the application, not the button ──
    await actor.reload();
    await expect(actor.getByText(/You applied on/)).toBeVisible();
    await expect(actor.getByRole('button', { name: 'Apply for this role' })).toHaveCount(0);

    // ── Tracked under My applications ──
    await actor.getByRole('link', { name: 'See all your applications' }).click();
    await expect(actor).toHaveURL('/applications');
    await expect(actor.getByRole('link', { name: actorRoleTitle })).toBeVisible();
    await expect(actor.getByText('Applied', { exact: true })).toBeVisible();

    // ── A role for another profession explains why there is no button ──
    await actor.goto(cameraRoleUrl);
    await expect(actor.getByRole('heading', { name: cameraRoleTitle })).toBeVisible();
    await expect(
      actor.getByText(
        'Only Camera Operator profiles can apply to this role. Your profile is registered as Actor.'
      )
    ).toBeVisible();
    await expect(actor.getByRole('button', { name: 'Apply for this role' })).toHaveCount(0);

    // ── The author sees how many have applied ──
    await page.goto(actorRoleUrl);
    await expect(page.getByText('1 application so far.')).toBeVisible();
    await page.goto(cameraRoleUrl);
    await expect(page.getByText('0 applications so far.')).toBeVisible();

    await actorContext.close();
  });

  test('a member with no applications sees an empty state', async ({ page }) => {
    await registerThrough(page, 'Esha Editor', 'EDITOR');
    await page.getByRole('link', { name: 'View my applications' }).click();
    await expect(page).toHaveURL('/applications');
    await expect(page.getByText('You have not applied to any casting roles yet.')).toBeVisible();
  });
});
