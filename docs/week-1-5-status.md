# Week 1–5 Status

Scope: WBS 1.1 User Management & Profiles. Every row states what exists, where
it lives, and the evidence behind it. Paths are relative to the repository root
unless noted.

Last verified by a full `npm run verify` run: **passed, exit code 0**
(format check → lint → typecheck → Prisma validate → build → 30 unit tests →
51 integration tests → 9 browser tests).

## Week 1 — Requirements, architecture, repository, environment

| Deliverable                                                       | Status | Files                                                                               | Evidence                                                                                     |
| ----------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Requirements and non-goals mapped to 1.1.1/1.1.2                  | Done   | `docs/requirements.md`                                                              | —                                                                                            |
| Architecture: boundaries, auth sequence, RBAC, data relationships | Done   | `docs/architecture/system-architecture.md`                                          | —                                                                                            |
| Implementation decisions and deviations                           | Done   | `docs/implementation-decisions.md`                                                  | —                                                                                            |
| npm workspaces with root scripts                                  | Done   | `package.json`                                                                      | `npm run verify`                                                                             |
| Strict TypeScript, ESLint, Prettier                               | Done   | `tsconfig*.json`, `apps/*/eslint.config.mjs`, `.prettierrc.json`, `.prettierignore` | `npm run lint`, `npm run typecheck`, `npm run format:check` all pass                         |
| Environment validation at startup                                 | Done   | `apps/backend/src/config/env.ts`                                                    | Rejects short, placeholder, or identical JWT secrets; `tests/unit/*` run against `.env.test` |
| Secret-free environment templates                                 | Done   | `.env.example`, `.env.test.example`                                                 | No secret values committed; both files carry generation instructions                         |
| Separate development and test database configuration              | Done   | `.env.test.example`, `apps/backend/tests/env.setup.ts`                              | Suite refuses to start unless the database name ends in `_test`                              |
| Ignore rules for env, uploads, build output, test artifacts       | Done   | `.gitignore`                                                                        | `storage/`, `storage-test/`, `storage-e2e/`, `test-results/`, `playwright-report/`, `.env*`  |
| Local PostgreSQL setup documented; Docker optional                | Done   | `README.md`, `docker-compose.yml`                                                   | Compose provides PostgreSQL only                                                             |

## Week 2 — Data model, migrations, API contracts

| Deliverable                                                         | Status | Files                                                                         | Evidence                                                                         |
| ------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `User` with authoritative `name`, normalized unique `email`         | Done   | `apps/backend/prisma/schema.prisma`                                           | `tests/integration/auth.test.ts`                                                 |
| `Role` enum, seven values, six publicly selectable                  | Done   | same                                                                          | `tests/integration/auth.test.ts` (every public role registers; `ADMIN` rejected) |
| `Profile`, one per user, created transactionally                    | Done   | same, `src/services/auth.service.ts`                                          | `tests/integration/auth.test.ts`                                                 |
| `Skill` with normalized uniqueness, `ProfileSkill` composite unique | Done   | same                                                                          | `tests/integration/profile.test.ts`                                              |
| `Experience` with calendar dates and nullable end date              | Done   | same                                                                          | `tests/integration/profile.test.ts`                                              |
| `RefreshToken` with digest, expiry and rotation state               | Done   | same                                                                          | `tests/integration/auth.test.ts`                                                 |
| Forward migration against an existing database, no history rewrite  | Done   | `prisma/migrations/20260919094048_profiles_skills_experience_refresh_tokens/` | Applied to development and test databases; `npm run db:validate` passes          |
| Relation deletion behaviour, indexes, nullability documented        | Done   | `docs/database/database-design.md`                                            | —                                                                                |
| Complete API specification                                          | Done   | `docs/api.md`, `docs/api/api-conventions.md`                                  | Matches the implemented responses                                                |

The migration adds `users.name` to a table that may already hold rows: add
nullable → backfill from the email local-part → create a profile for every
existing user → apply `NOT NULL`.

## Week 3 — Express foundation and authentication

| Deliverable                                                                               | Status | Files                                                                                       | Evidence                                                                                      |
| ----------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Importable `app.ts`, separate `server.ts` with graceful shutdown                          | Done   | `src/app.ts`, `src/server.ts`                                                               | Integration tests import `app` without binding a port                                         |
| CORS, helmet, bounded JSON, cookies, logging, 404, central error handler                  | Done   | `src/app.ts`, `src/middleware/*`                                                            | `tests/integration/auth.test.ts`                                                              |
| Health endpoint with a real database round-trip                                           | Done   | `src/routes/health.routes.ts`                                                               | Used as the E2E readiness probe                                                               |
| Registration: Zod, role allowlist, normalized email, bcrypt, transaction, duplicate races | Done   | `src/services/auth.service.ts`, `src/validators/auth.validator.ts`                          | `tests/integration/auth.test.ts` (concurrent registration yields one account and one profile) |
| Login: generic errors, both token types, refresh persistence                              | Done   | `src/services/auth.service.ts`                                                              | `tests/integration/auth.test.ts`                                                              |
| `authenticate` + `requireRole`, role read from the database                               | Done   | `src/middleware/auth.middleware.ts`, `src/middleware/role.middleware.ts`                    | `tests/integration/auth.test.ts` (role change respected without re-login)                     |
| Atomic refresh rotation, idempotent logout                                                | Done   | `src/services/auth.service.ts`                                                              | `tests/integration/auth.test.ts` (6 concurrent uses → exactly one 200)                        |
| Origin validation and required client header                                              | Done   | `src/middleware/origin.middleware.ts`                                                       | `tests/integration/auth.test.ts`                                                              |
| Auth throttling, configurable, in-process                                                 | Done   | `src/routes/auth.routes.ts`                                                                 | `tests/integration/auth.test.ts`                                                              |
| Narrow ADMIN-only demonstration endpoint                                                  | Done   | `src/controllers/admin.controller.ts`, `src/routes/admin.routes.ts`                         | `tests/integration/auth.test.ts` (403 non-admin, 200 admin)                                   |
| Postman collection and secret-free environment                                            | Done   | `postman/abhinay.postman_collection.json`, `postman/abhinay.local.postman_environment.json` | Imported structure only; **the collection has not been executed** — see Unverified            |
| Errors never log secrets                                                                  | Done   | `src/middleware/error.middleware.ts`, `src/app.ts`                                          | Morgan `dev` format logs method/path/status only                                              |

## Week 4 — Next.js authentication and dashboard

| Deliverable                                                                                | Status | Files                                                           | Evidence                                                            |
| ------------------------------------------------------------------------------------------ | ------ | --------------------------------------------------------------- | ------------------------------------------------------------------- |
| `/register` with six roles, confirm password not sent                                      | Done   | `apps/frontend/src/app/register/page.tsx`                       | `tests/e2e/flows.spec.ts`                                           |
| `/login` with validation, loading state, server errors                                     | Done   | `src/app/login/page.tsx`                                        | `tests/e2e/flows.spec.ts`                                           |
| `/dashboard` with greeting, role, navigation, logout                                       | Done   | `src/app/dashboard/page.tsx`                                    | `tests/e2e/flows.spec.ts`                                           |
| `/settings` read-only account information                                                  | Done   | `src/app/settings/page.tsx`                                     | `tests/e2e/flows.spec.ts`                                           |
| `lib/api.ts`: base URL, credentials, JSON/multipart, 204, refresh coordination, `ApiError` | Done   | `src/lib/api.ts`                                                | `tests/e2e/flows.spec.ts`                                           |
| Auth context with user, role, authenticated and initialising states                        | Done   | `src/hooks/useAuth.tsx`                                         | `tests/e2e/flows.spec.ts` (reload restores the session)             |
| Route guard, validated internal `returnTo`, no open redirect                               | Done   | `src/components/common/RequireAuth.tsx`                         | `tests/e2e/flows.spec.ts` (external `returnTo` ignored)             |
| Truthful logout on network failure                                                         | Done   | `src/hooks/useAuth.tsx`, `src/components/common/SiteHeader.tsx` | Reports "signed out locally" rather than claiming server revocation |
| Accessible labels, focus states, responsive layout, system fonts                           | Done   | `src/components/ui/index.tsx`, `src/app/globals.css`            | Browser tests address every control by its accessible name          |
| Applications/Messages as disabled placeholders only                                        | Done   | `src/app/dashboard/page.tsx`                                    | No routes, endpoints or tables exist for them                       |

## Week 5 — Professional profile management

| Deliverable                                                              | Status | Files                                                                                             | Evidence                                                                                             |
| ------------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `GET/PUT /profile/me` with owner projection and strict allowlist         | Done   | `src/services/profile.service.ts`, `src/validators/profile.validator.ts`                          | `tests/integration/profile.test.ts`                                                                  |
| `/profile` and `/profile/edit` with independent sections                 | Done   | `apps/frontend/src/app/profile/page.tsx`, `src/app/profile/edit/*`                                | `tests/e2e/flows.spec.ts`                                                                            |
| Skills: add, list, remove, idempotent, normalized, bounded               | Done   | `src/services/profile.service.ts`, `src/app/profile/edit/SkillsSection.tsx`                       | `tests/integration/profile.test.ts`, `tests/e2e/flows.spec.ts`                                       |
| Experience: CRUD, real dates, chronology, ordering, ownership predicates | Done   | `src/services/profile.service.ts`, `src/app/profile/edit/ExperienceSection.tsx`                   | `tests/integration/profile.test.ts`, `tests/unit/validators.test.ts`                                 |
| Photo: upload, preview, validation, replacement, cleanup, removal        | Done   | `src/services/image.service.ts`, `src/config/storage.ts`, `src/app/profile/edit/PhotoSection.tsx` | `tests/integration/photo.test.ts`, `tests/unit/image-and-storage.test.ts`, `tests/e2e/flows.spec.ts` |
| Media served from the Express origin, not `/api`, not Next.js            | Done   | `src/app.ts`, `src/services/dto.ts`                                                               | `tests/e2e/flows.spec.ts` asserts the rendered `src`                                                 |
| `/profile/[id]` public page with not-found and error states              | Done   | `apps/frontend/src/app/profile/[id]/page.tsx`                                                     | `tests/e2e/flows.spec.ts`                                                                            |
| Public API excludes email, phone, hashes, session data                   | Done   | `src/services/dto.ts`                                                                             | `tests/integration/profile.test.ts`, `tests/e2e/flows.spec.ts` asserts the rendered HTML             |
| Header/dashboard/profile agree after a rename or photo change            | Done   | `src/hooks/useAuth.tsx`, `src/app/profile/edit/page.tsx`                                          | `tests/e2e/flows.spec.ts`                                                                            |
| User B cannot read or alter user A's private data                        | Done   | `src/services/profile.service.ts`                                                                 | `tests/integration/profile.test.ts`, `tests/e2e/flows.spec.ts`                                       |

## Executed checks

| Command                                              | Result                                                |
| ---------------------------------------------------- | ----------------------------------------------------- |
| `npm run format:check`                               | Pass                                                  |
| `npm run lint`                                       | Pass, no warnings                                     |
| `npm run typecheck`                                  | Pass (both workspaces)                                |
| `npm run db:validate`                                | Pass                                                  |
| `npm run db:migrate:deploy`                          | Pass on development and `abhinay_test`                |
| `npm run build`                                      | Pass (Next.js production build + `tsc` backend build) |
| `npm run test:unit`                                  | 30 passed, 3 files                                    |
| `npm run test:integration`                           | 51 passed, 3 files, real PostgreSQL                   |
| `npm run test:e2e`                                   | 9 passed, Chromium, built stack on ports 3100/5100    |
| `npm run verify`                                     | Pass, exit code 0                                     |
| `npm ci` from the committed lockfile in a clean copy | Pass, exit code 0                                     |

## Unverified / not run

- **Postman collection has not been executed.** It is structurally complete
  with tests attached to every request, but no run was performed, so no claim
  is made about its results. Import it, set `email` and `password`, then use
  Collection Runner.
- **Manual browser walkthrough was not performed by hand.** All browser
  evidence comes from the automated Playwright suite.
- **Only Chromium is covered.** Firefox and WebKit are not configured.
- **Production deployment is untested and out of scope.** `Secure` cookies and
  HTTPS behaviour are configured but only exercised in development mode.

## Known issues and blockers

- **Dependency advisories (pre-existing, not introduced by the feature work).**
  `npm audit` reports 17 findings in the installed tree, including a critical
  advisory for `next@16.3.2` with a non-breaking fix at `16.3.5`, and high
  advisories for `sharp`, `vitest` and `tar` whose fixes are semver-major.
  Versions were left as committed rather than force-upgraded. To address the
  non-breaking one deliberately:
  `npm install next@^16.3.5 --workspace=apps/frontend`, then rerun
  `npm run verify`.
- **Refresh-token rows are never pruned.** Revoked and expired rows accumulate;
  periodic cleanup belongs with deployment work, which is out of scope.
- **Rate limiting is in-process**, so it resets on restart and is per-instance.
  A shared store was explicitly ruled out for a local stack.
- **`prisma` prints a deprecation warning** about `package.json#prisma` moving
  to `prisma.config.ts` in Prisma 7. Harmless on the installed 6.x, and
  migrating the configuration is a dependency-upgrade task.

## Out of scope, intentionally absent

Casting and role postings, applications, shortlists, messaging, auditions,
self-tapes, project pages, crew linking, social feed, admin dashboard, account
deletion, password reset, email verification, cloud storage, deployment. None
of these exist as stubs, tables, endpoints or fake links.
