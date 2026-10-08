# Week 10 Status

Scope, as approved by the client on 2026-10-08:

- **WBS 1.2.1** — an optional application deadline on casting roles, with browse
  sorting and a "closing by" filter;
- **WBS 1.2.3 Shortlist Management** — the author's applicant list (also WBS
  1.3.1.1) and shortlist folders;
- **WBS 1.1.2.2 / 1.1.2.3** — CV, portfolio photos and reels, with every upload
  (including the existing profile photo) moved to **Cloudinary**.

Decided with the client: admin moderation of castings stays in WBS 1.6;
browsing still requires a session. Paths are relative to the repository root
unless noted.

## 1.2.1 Application deadline and browse sorting

| Deliverable                                                           | Status | Files                                                                                                 | Evidence                                                                              |
| --------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `application_deadline` (`date`, nullable) + index                     | Done   | `apps/backend/prisma/schema.prisma`, `migrations/20261008105134_deadline_shortlists_portfolio_media/` | Additive; applied to `abhinay` and `abhinay_test`                                     |
| Platform calendar (`APP_TIME_ZONE`, default Asia/Kolkata)             | Done   | `apps/backend/src/utils/calendar.ts`, `src/config/env.ts`                                             | `tests/unit/calendar.test.ts`                                                         |
| New deadline today … +365 days; expired one may be kept on edit       | Done   | `src/services/casting.service.ts`, `src/validators/casting.validator.ts`                              | `tests/integration/casting-deadline.test.ts`                                          |
| Expired roles hidden from browse; apply → 409 `DEADLINE_PASSED`       | Done   | `src/services/casting.service.ts`, `src/services/application.service.ts`                              | `tests/integration/casting-deadline.test.ts`                                          |
| Publishing an expired draft → 409                                     | Done   | `src/services/casting.service.ts`                                                                     | `tests/integration/casting-deadline.test.ts`                                          |
| `sort=newest\|oldest\|deadline`, `deadlineBefore`, `q` ⊇ compensation | Done   | `src/validators/casting.validator.ts`, `src/services/casting.service.ts`                              | `tests/integration/casting-deadline.test.ts`, `tests/unit/casting-validators.test.ts` |
| UI: date picker, "Apply by …" on cards and detail, sort + filter      | Done   | `apps/frontend/src/components/casting/*`, `src/app/casting/page.tsx`, `src/app/casting/[id]/page.tsx` | `tests/e2e/shortlists.spec.ts`                                                        |

## 1.2.3 Shortlist Management

| Deliverable                                                        | Status | Files                                                                          | Evidence                                                                          |
| ------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `shortlist_folders`, `shortlist_entries`                           | Done   | `apps/backend/prisma/schema.prisma`, same migration                            | Unique `(role, normalized_name)` and `(folder, application)`                      |
| Author's applicant list — public facts only, folder filter, paging | Done   | `src/services/shortlist.service.ts`, `src/services/dto.ts`                     | `tests/integration/shortlists.test.ts`                                            |
| Create / rename / delete folders (≤ 20 per role, unique names)     | Done   | `src/services/shortlist.service.ts`, `src/validators/shortlist.validator.ts`   | `tests/integration/shortlists.test.ts`, `tests/unit/shortlist-validators.test.ts` |
| File / unfile applicants — idempotent, same role only              | Done   | `src/services/shortlist.service.ts`, `src/controllers/shortlist.controller.ts` | `tests/integration/shortlists.test.ts`                                            |
| Non-posters 403, other posters 404 on every endpoint               | Done   | `src/routes/casting.routes.ts`                                                 | `tests/integration/shortlists.test.ts`                                            |
| Page `/casting/[id]/applicants` with folder chips and toggles      | Done   | `apps/frontend/src/app/casting/[id]/applicants/page.tsx`                       | `tests/e2e/shortlists.spec.ts`                                                    |

## 1.1.2.2 / 1.1.2.3 Media on Cloudinary

| Deliverable                                                                | Status | Files                                                                                        | Evidence                                                                 |
| -------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Storage interface: Cloudinary driver (default) + local driver (tests)      | Done   | `apps/backend/src/config/storage.ts`                                                         | `tests/unit/cloudinary-storage.test.ts` (SDK mocked)                     |
| Temp file → validate → upload → save link → delete temp, on every path     | Done   | `src/middleware/upload.middleware.ts`, `src/services/profile-media.service.ts`               | `tests/integration/media.test.ts` (temp dir empty after every request)   |
| CV (PDF, signature-checked), portfolio photos (≤ 12), reels (≤ 4, ≤ 3 min) | Done   | `src/services/media-validation.service.ts`, `src/services/image.service.ts`                  | `tests/unit/media-validation.test.ts`, `tests/integration/media.test.ts` |
| Provider failure 502, DB failure deletes upload, no credentials 503        | Done   | `src/services/profile-media.service.ts`                                                      | `tests/integration/media.test.ts`                                        |
| Photos stored before Cloudinary keep working (migration backfill)          | Done   | `migration.sql`, `src/services/dto.ts`                                                       | `tests/integration/media.test.ts`                                        |
| Stale temp files swept on startup and hourly                               | Done   | `src/config/storage.ts`, `src/server.ts`                                                     | `tests/integration/media.test.ts`                                        |
| UI: CV and portfolio sections on edit; shown on the public profile         | Done   | `apps/frontend/src/app/profile/edit/{ResumeSection,PortfolioSection}.tsx`, `ProfileView.tsx` | `tests/e2e/media.spec.ts`                                                |
| `.env` placeholders for the Cloudinary key and secret                      | Done   | `.env.example`, `.env.test.example` (and the local, untracked `.env` / `.env.test`)          | —                                                                        |

## Executed checks

Run on 2026-10-08.

| Command                    | Result                                                                                                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run format:check`     | Pass                                                                                                                                                             |
| `npm run lint`             | Pass, both workspaces                                                                                                                                            |
| `npm run typecheck`        | Pass, both workspaces                                                                                                                                            |
| `npm run db:validate`      | Pass                                                                                                                                                             |
| `npm run build`            | Pass, both workspaces                                                                                                                                            |
| `npm run test:unit`        | 74 passed, 9 files (was 44)                                                                                                                                      |
| `npm run test:integration` | 132 of 133 passed, 8 files (was 94). The one failure is the pre-existing intermittent auth test, which also failed in the baseline run before any Week-10 change |
| `npm run test:e2e`         | 17 passed, Chromium (was 14)                                                                                                                                     |
| `prisma migrate status`    | Up to date on `abhinay` and `abhinay_test` (5 migrations)                                                                                                        |

Because `npm run verify` stops at the first failing step, the auth test above
keeps it from reaching the browser suite; `test:e2e` was run on its own against
the same code.

## Unverified / not run

- **No real Cloudinary upload has been made.** The API key and secret are not
  set yet; the Cloudinary driver is covered by unit tests with the SDK mocked,
  and every suite uses the local driver. After adding the credentials, upload a
  photo, CV and reel once and check they appear under `abhinay/` in the
  Cloudinary media library.
- The Postman additions were checked to parse, but newman was not run against
  them (it would write to the development database).
- Only Chromium is covered.

## Known issues

- Reel length is only enforced by Cloudinary (it reports the duration); the
  local driver cannot measure it.
- A file whose deletion fails after a replacement is left in Cloudinary and
  logged; there is no reconciliation job.
- CVs are public on the profile (the form says so); Cloudinary delivery URLs are
  unguessable but not access-controlled.
- Pre-existing and unchanged: the intermittent concurrent-refresh test in
  `auth.test.ts` (see `week-6-9-status.md`).

## Next increment

**WBS 1.3 Application lifecycle** — the author moves applications through
Shortlisted, Selected and Rejected (from the applicant page built here), and the
applicant is notified.
