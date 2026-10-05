import { expect, test, type Page } from '@playwright/test';

/**
 * Browser coverage of the register → login → protected navigation → reload →
 * logout journey, plus the full profile management flow and public viewing.
 *
 * Every assertion goes through the real Next.js client, the real Express API and
 * the real `*_test` PostgreSQL database.
 */

const PASSWORD = 'correct horse battery staple';

function uniqueEmail(prefix: string): string {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 10_000)}@example.test`;
}

async function registerThrough(page: Page, name: string, email: string, role = 'DIRECTOR') {
  await page.goto('/register');
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirm password').fill(PASSWORD);
  await page.getByLabel('Professional role').selectOption(role);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL('/dashboard');
}

test.describe('Authentication journey', () => {
  test('register, navigate, reload, and log out', async ({ page }) => {
    const email = uniqueEmail('journey');
    await registerThrough(page, 'Journey Director', email);

    await expect(page.getByRole('heading', { name: 'Welcome, Journey Director' })).toBeVisible();
    await expect(page.getByText('Signed in as Director')).toBeVisible();

    // Protected navigation.
    await page.getByRole('link', { name: 'View profile' }).click();
    await expect(page).toHaveURL('/profile');
    await expect(page.getByRole('heading', { name: 'Journey Director' })).toBeVisible();

    // The refresh cookie restores the session across a full reload; the access
    // token itself only ever lived in memory.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Journey Director' })).toBeVisible();

    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL('/login');

    // The session is really gone — a protected route bounces back to login.
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fdashboard/);
  });

  test('log in with an existing account and land on the requested page', async ({ page }) => {
    const email = uniqueEmail('returning');
    await registerThrough(page, 'Returning Producer', email, 'PRODUCER');
    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL('/login');

    // Deep link to a protected page while logged out.
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fsettings/);

    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Log in' }).click();

    // Honoured because it is an internal, path-only destination.
    await expect(page).toHaveURL('/settings');
    await expect(page.getByRole('heading', { name: 'Account settings' })).toBeVisible();
  });

  test('rejects an external returnTo instead of redirecting off-site', async ({ page }) => {
    const email = uniqueEmail('redirect');
    await registerThrough(page, 'Redirect Tester', email);
    await page.getByRole('button', { name: 'Log out' }).click();

    await page.goto('/login?returnTo=https://evil.example/steal');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Log in' }).click();

    await expect(page).toHaveURL('/dashboard');
  });

  test('shows client validation and a real server error without false success', async ({
    page,
  }) => {
    await page.goto('/register');
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByText('Name must be at least 2 characters')).toBeVisible();
    await expect(page.getByText('Email is required')).toBeVisible();
    await expect(page.getByText('Password must be at least 6 characters')).toBeVisible();
    await expect(page).toHaveURL('/register');

    // Client-side confirmation mismatch.
    await page.getByLabel('Full name').fill('Mismatch Person');
    await page.getByLabel('Email').fill(uniqueEmail('mismatch'));
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Confirm password').fill('a different password');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('Passwords do not match')).toBeVisible();

    // Server-side duplicate email, mapped onto the email control.
    const taken = uniqueEmail('taken');
    await registerThrough(page, 'First Claimant', taken);
    await page.getByRole('button', { name: 'Log out' }).click();

    await page.goto('/register');
    await page.getByLabel('Full name').fill('Second Claimant');
    await page.getByLabel('Email').fill(taken);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Confirm password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByText('An account with this email already exists')).toBeVisible();
    await expect(page).toHaveURL('/register');
  });

  test('bad credentials produce an error, not a session', async ({ page }) => {
    const email = uniqueEmail('wrongpass');
    await registerThrough(page, 'Wrong Password', email);
    await page.getByRole('button', { name: 'Log out' }).click();

    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('not the right password');
    await page.getByRole('button', { name: 'Log in' }).click();

    await expect(page.getByText('Invalid email or password')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
    // The email is preserved so the user does not have to retype it.
    await expect(page.getByLabel('Email')).toHaveValue(email);
  });
});

test.describe('Profile management', () => {
  test('edit details, manage skills and credits, upload a photo, and view it publicly', async ({
    page,
    context,
  }) => {
    const email = uniqueEmail('profile');
    await registerThrough(page, 'Nina Rao', email, 'EDITOR');

    await page.goto('/profile/edit');
    await expect(page.getByRole('heading', { name: 'Edit profile' })).toBeVisible();

    // Email and role are visible but not editable.
    await expect(page.getByLabel('Email')).toBeDisabled();
    await expect(page.getByLabel('Professional role')).toBeDisabled();

    // ── Scalar fields ──
    await page.getByLabel('Full name').fill('Nina Rao Verma');
    await page.getByLabel('Bio').fill('Editor working across documentary and long-form drama.');
    await page.getByLabel('Location').fill('Chennai, India');
    await page.getByLabel('Phone').fill('+91 90000 11111');
    await page.getByRole('button', { name: 'Save details' }).click();
    await expect(page.getByText('Profile saved.')).toBeVisible();

    // The header reflects the rename immediately — no disagreement between views.
    await expect(page.getByText('Nina Rao Verma · Editor')).toBeVisible();

    // ── Skills ──
    await page.getByLabel('Add a skill').fill('Avid Media Composer');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText('Added "Avid Media Composer".')).toBeVisible();

    // Re-adding is idempotent, not a duplicate chip.
    await page.getByLabel('Add a skill').fill('avid media composer');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText('is already on your profile.')).toBeVisible();

    await page.getByLabel('Add a skill').fill('Colour Grading');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByLabel('Remove Colour Grading')).toBeVisible();

    await page.getByLabel('Remove Colour Grading').click();
    await expect(page.getByLabel('Remove Colour Grading')).toHaveCount(0);

    // ── Experience ──
    await page.getByRole('button', { name: 'Add credit' }).click();
    await page.getByLabel('Title').fill('Lead Editor');
    await page.getByLabel('Production or organization').fill('Monsoon Pictures');
    await page.getByLabel('Start date').fill('2023-04-01');
    await page.getByLabel('End date').fill('2023-11-30');
    await page.getByLabel('Description').fill('Feature documentary.');
    await page.getByRole('button', { name: 'Add credit' }).last().click();
    await expect(page.getByText('Lead Editor')).toBeVisible();

    // A reversed range is refused.
    await page.getByRole('button', { name: 'Add credit' }).click();
    await page.getByLabel('Title').fill('Impossible Credit');
    await page.getByLabel('Production or organization').fill('Nowhere');
    await page.getByLabel('Start date').fill('2024-05-01');
    await page.getByLabel('End date').fill('2024-01-01');
    await page.getByRole('button', { name: 'Add credit' }).last().click();
    await expect(page.getByText('End date cannot be before the start date')).toBeVisible();
    // Scoped to the credit form: the basic-details form has a Cancel too.
    await page
      .getByRole('form', { name: 'New credit' })
      .getByRole('button', { name: 'Cancel' })
      .click();

    // ── Photo ──
    // A tiny valid 1x1 PNG, so the upload path is exercised end to end.
    const pngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    await page.getByLabel('Choose an image').setInputFiles({
      name: 'headshot.png',
      mimeType: 'image/png',
      buffer: Buffer.from(pngBase64, 'base64'),
    });
    await page.getByRole('button', { name: 'Upload photo' }).click();
    await expect(page.getByText('Photo updated.')).toBeVisible();

    // ── Persistence across a reload ──
    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: 'Nina Rao Verma' })).toBeVisible();
    await expect(page.getByText('Chennai, India')).toBeVisible();
    await expect(page.getByText('Avid Media Composer')).toBeVisible();
    await expect(page.getByText('Lead Editor')).toBeVisible();
    await expect(page.getByText('+91 90000 11111')).toBeVisible();

    const photo = page.getByRole('img', { name: /profile photo/ });
    await expect(photo).toBeVisible();
    // Served from the Express media origin, not from Next.js and not under /api.
    const src = await photo.getAttribute('src');
    expect(src).toMatch(/\/media\/profile-photos\//);
    expect(src).not.toMatch(/\/api\//);

    const publicUrl = new URL(page.url());
    await page.getByRole('link', { name: 'View public page' }).click();
    await expect(page).toHaveURL(/\/profile\/[0-9a-f-]{36}$/);
    const publicPath = new URL(page.url()).pathname;

    // ── Public view, logged out, in a clean browser context ──
    const anonymous = await context.browser()!.newPage();
    await anonymous.goto(`${publicUrl.origin}${publicPath}`);

    await expect(anonymous.getByRole('heading', { name: 'Nina Rao Verma' })).toBeVisible();
    await expect(anonymous.getByText('Editor', { exact: true })).toBeVisible();
    await expect(anonymous.getByText('Avid Media Composer')).toBeVisible();
    await expect(anonymous.getByText('Lead Editor')).toBeVisible();

    // Private data is absent from the rendered HTML, not merely hidden by CSS.
    const html = await anonymous.content();
    expect(html).not.toContain(email);
    expect(html).not.toContain('+91 90000 11111');
    expect(html).not.toContain('passwordHash');
    await expect(anonymous.getByRole('link', { name: 'Edit profile' })).toHaveCount(0);

    await anonymous.close();
  });

  test('user B cannot see or alter user A private data', async ({ page, context }) => {
    const aliceEmail = uniqueEmail('alice');
    await registerThrough(page, 'Alice Aperture', aliceEmail, 'CAMERA_OPERATOR');

    await page.goto('/profile/edit');
    await page.getByLabel('Phone').fill('+91 99999 88888');
    await page.getByRole('button', { name: 'Save details' }).click();
    await expect(page.getByText('Profile saved.')).toBeVisible();

    await page.goto('/profile');
    await page.getByRole('link', { name: 'View public page' }).click();
    // Wait for the navigation to land before reading the URL, otherwise this
    // can still capture /profile.
    await expect(page).toHaveURL(/\/profile\/[0-9a-f-]{36}$/);
    const alicePublicUrl = page.url();

    await page.getByRole('button', { name: 'Log out' }).click();

    // Bob, in a separate context, sees only the public projection.
    const bobContext = await context.browser()!.newContext();
    const bob = await bobContext.newPage();
    await registerThrough(bob, 'Bob Boom', uniqueEmail('bob'), 'OTHER_CREW');

    await bob.goto(alicePublicUrl);
    await expect(bob.getByRole('heading', { name: 'Alice Aperture' })).toBeVisible();

    const html = await bob.content();
    expect(html).not.toContain(aliceEmail);
    expect(html).not.toContain('+91 99999 88888');

    // Bob's own profile is untouched by visiting Alice's page.
    await bob.goto('/profile');
    await expect(bob.getByRole('heading', { name: 'Bob Boom' })).toBeVisible();

    await bobContext.close();
  });

  test('renders a not-found state for an unknown profile', async ({ page }) => {
    await page.goto('/profile/00000000-0000-4000-8000-000000000000');
    await expect(page.getByRole('heading', { name: 'Profile not found' })).toBeVisible();

    await page.goto('/profile/not-a-real-id');
    await expect(page.getByRole('heading', { name: 'Profile not found' })).toBeVisible();
  });

  test('shows empty states on a brand new profile', async ({ page }) => {
    await registerThrough(page, 'Empty Statey', uniqueEmail('empty'));
    await page.goto('/profile');

    await expect(page.getByText('No bio yet.')).toBeVisible();
    await expect(page.getByText('No skills listed yet.')).toBeVisible();
    await expect(page.getByText('No credits listed yet.')).toBeVisible();
  });
});
