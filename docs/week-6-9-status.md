# Week 6–9 Status

Scope: repository hygiene; from **WBS 1.2 Casting Marketplace**, **1.2.1 Casting
Role Posting** and **1.2.2 Role Discovery & Application** (browse, search and
apply); the completed theme; and the password policy change. Lab 6 scheduled the
casting module for Weeks 6–7; this work landed in Week 9. Paths are relative to
the repository root unless noted.

Last verified on 2026-10-05 by a full `npm run verify`: **passed** — format
check, lint, typecheck, Prisma validate, build, **44 unit, 94 integration and 14
browser tests**.

## Repository hygiene

| Deliverable                       | Status | Files                                                                 | Evidence                                                                                 |
| --------------------------------- | ------ | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Secret-free environment templates | Done   | `.env.example`, `.env.test.example`                                   | Cover every variable `apps/backend/src/config/env.ts` reads; the README setup now works  |
| Formatting gate restored          | Done   | `apps/frontend/src/components/ui/*`, `apps/frontend/src/lib/utils.ts` | `prettier --check` passes; formatting only, no behaviour change                          |
| Next.js critical advisory         | Done   | `apps/frontend/package.json`, `package-lock.json`                     | `next` and `eslint-config-next` pinned at 16.3.8; `npm audit` no longer reports `next`   |
| Postman scripts runnable          | Done   | `postman/abhinay.postman_collection.json`                             | A top-level `const data` collided with the sandbox global; renamed; executed with newman |

## 1.2.1 Casting Role Posting

| Deliverable                                      | Status | Files                                                                                                          | Evidence                                                                      |
| ------------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `CastingRole` model, `CastingRoleStatus` enum    | Done   | `apps/backend/prisma/schema.prisma`, `prisma/migrations/20261005090213_casting_marketplace/`                   | Additive migration; applied to `abhinay` and `abhinay_test`                   |
| Create as a draft — producers and directors only | Done   | `src/routes/casting.routes.ts`, `src/validators/casting.validator.ts`, `src/controllers/casting.controller.ts` | `tests/integration/casting.test.ts`                                           |
| Publish and close, idempotent, race-safe         | Done   | `src/services/casting.service.ts`                                                                              | `tests/integration/casting.test.ts` (6 concurrent publishes → one transition) |
| Edit drafts and open roles; delete drafts only   | Done   | `src/services/casting.service.ts`                                                                              | `tests/integration/casting.test.ts`, `tests/e2e/casting.spec.ts`              |
| Ownership in every write; drafts private (404)   | Done   | `src/services/casting.service.ts`                                                                              | `tests/integration/casting.test.ts`, `tests/e2e/casting.spec.ts`              |
| Poster shown with public facts only              | Done   | `src/services/dto.ts`                                                                                          | `tests/integration/casting.test.ts`                                           |
| `PATCH` allowed by CORS                          | Done   | `src/app.ts`                                                                                                   | `tests/integration/casting.test.ts` (preflight)                               |
| Pages: post, detail, edit, my postings           | Done   | `apps/frontend/src/app/casting/{create,[id],[id]/edit,mine}/`, `src/components/casting/*`                      | `tests/e2e/casting.spec.ts`                                                   |

## 1.2.2.1 Browse & search

| Deliverable                                                 | Status | Files                                                                | Evidence                                                         |
| ----------------------------------------------------------- | ------ | -------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Open roles, newest first, paginated (≤ 50 per page)         | Done   | `src/services/casting.service.ts`                                    | `tests/integration/casting.test.ts`                              |
| Search across title, description, requirements and location | Done   | `src/services/casting.service.ts`                                    | `tests/integration/casting.test.ts` (`%`, `_`, `\` literal)      |
| Filters: profession sought, location                        | Done   | `src/validators/casting.validator.ts`                                | `tests/integration/casting.test.ts`, `tests/e2e/casting.spec.ts` |
| `/casting` with shareable URL filters and every page state  | Done   | `apps/frontend/src/app/casting/page.tsx`                             | `tests/e2e/casting.spec.ts`                                      |
| Entry points: header link, role-aware dashboard card        | Done   | `src/components/common/SiteHeader.tsx`, `src/app/dashboard/page.tsx` | `tests/e2e/casting.spec.ts`                                      |

## 1.2.2.2 Apply to a casting role

| Deliverable                                                         | Status | Files                                                                                 | Evidence                                                                              |
| ------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `Application` model, `ApplicationStatus` enum (four Lab 2 statuses) | Done   | `apps/backend/prisma/schema.prisma`, `prisma/migrations/20261005095956_applications/` | Additive migration; applied to `abhinay` and `abhinay_test`                           |
| Apply: matching profession only, never the author, open roles only  | Done   | `src/services/application.service.ts`, `src/controllers/application.controller.ts`    | `tests/integration/applications.test.ts`                                              |
| One application per member per role, race-safe                      | Done   | Unique pair in `schema.prisma`; `FOR SHARE` lock in `application.service.ts`          | `tests/integration/applications.test.ts` (5 concurrent attempts → one)                |
| "My applications", newest first, status filter, paging              | Done   | `src/routes/application.routes.ts`, `src/validators/application.validator.ts`         | `tests/integration/applications.test.ts`, `tests/unit/application-validators.test.ts` |
| Role page: own application for members, count only for the author   | Done   | `src/services/dto.ts`, `apps/frontend/src/components/casting/ApplyPanel.tsx`          | `tests/integration/applications.test.ts`, `tests/e2e/applications.spec.ts`            |
| Pages: apply with confirmation, `/applications`, dashboard card     | Done   | `apps/frontend/src/app/applications/page.tsx`, `src/app/casting/[id]/page.tsx`        | `tests/e2e/applications.spec.ts`                                                      |

## Theme and password policy

| Deliverable                                      | Status | Files                                                                                         | Evidence                                                                                    |
| ------------------------------------------------ | ------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Brand colours moved onto the new theme           | Done   | `apps/frontend/src/app/globals.css`, `layout.tsx`                                             | Computed styles checked in Chromium: CTAs use the theme primary; gradient and pulse render  |
| Password minimum lowered from 12 to 6 characters | Done   | `apps/backend/src/utils/password.ts`, `apps/frontend/src/lib/validation.ts`, `prisma/seed.ts` | `tests/unit/validators.test.ts`, `tests/e2e/flows.spec.ts`; a 6-character account registers |

## Executed checks

| Command                           | Result                                                                                    |
| --------------------------------- | ----------------------------------------------------------------------------------------- |
| `npm run verify`                  | Pass: format check, lint, typecheck, Prisma validate, build and all three suites          |
| `npm run test:unit`               | 44 passed, 5 files                                                                        |
| `npm run test:integration`        | 94 passed, 5 files, real PostgreSQL                                                       |
| `npm run test:e2e`                | 14 passed, Chromium, built stack on ports 3100/5100                                       |
| `prisma migrate status`           | Up to date on `abhinay` and `abhinay_test` (4 migrations)                                 |
| newman, whole collection          | 47 requests, 47/50 assertions; the 3 failures are the two requests that need manual setup |
| Screenshots at 1280 px and 390 px | Every casting and application page, plus the themed home, dashboard and profile pages     |

## Unverified / not run

- No manual walkthrough by hand; browser evidence comes from Playwright and the
  screenshots above.
- Only Chromium is covered.
- Production deployment is untested (Weeks 12–14).

## Known issues

- **Secondary buttons inside cards.** Existing pages style secondary links as
  `bg-zinc-800`, which is almost the new theme's card colour, so inside a card
  ("Edit profile", "View my applications") they read as plain text. Swapping
  those hard-coded classes for `buttonVariants({ variant: 'outline' })` fixes it.
- **Card padding.** Since the shadcn `Card` replaced the original one, content
  placed directly inside `<Card>` has no horizontal padding (dashboard, profile,
  settings and the auth pages). The casting pages use `CardContent`.
- **Password strength.** The 6-character minimum is below NIST SP 800-63B's 8;
  see `implementation-decisions.md`.
- **Intermittent auth test (pre-existing).**
  `auth.test.ts › allows at most one success when the same token is consumed
concurrently` failed once in nine integration runs on 2026-10-05 and passed on
  every rerun. Cause: a request that reads the refresh token just after another
  request's rotation commits takes the interrupted-rotation recovery path
  (consumed under 10 s ago, replacement unused) and also succeeds. "At most one
  success" therefore holds only when the concurrent requests all read before the
  first commit. The auth code was not touched in Weeks 6–9; the fix is a design
  decision (tighten the recovery rule, or make the test assert the guarantee the
  design actually gives).
- **Dependency advisories.** 25 findings (2 critical, 16 high, 7 moderate). The
  critical ones are `tar` (fix available; reached through bcrypt's build chain)
  and `vitest` (development only; the fix is a major version). `sharp` is high
  with a major-version fix.
- **Stale nested lockfiles.** `apps/backend/package-lock.json` and
  `apps/frontend/package-lock.json` predate the npm workspace and are no longer
  updated; the root `package-lock.json` is authoritative.
- **Deferred from WBS 1.1:** resume/CV and reel upload; see
  [`requirements.md`](requirements.md#deferred-from-wbs-11).
- **Schedule.** Casting sits on the Lab 7 critical path and started 15 working
  days after its planned start, so the remaining critical activities need
  compressing to hold the 16-11-2026 delivery date.

## Next increments

1. **1.2.3 Shortlist folders** — per-role folders and the author's applicant
   list (which is also WBS 1.3.1.1, "view applicants per posting").
2. **1.3 Application lifecycle** — the author moves applications through
   Shortlisted, Selected and Rejected, and the applicant is notified.
