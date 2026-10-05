# Requirements — WBS 1.1 User Management & Profiles, WBS 1.2 Casting (1.2.1, 1.2.2)

Scope of this document: **WBS 1.1.1 User Registration & Authentication** and
**WBS 1.1.2 Professional Profile Management**, delivered across Weeks 1–5, and
from **WBS 1.2 Casting Marketplace** — **1.2.1 Casting Role Posting** and
**1.2.2 Role Discovery & Application** (browse, search and apply) — delivered in
Week 9. Everything else is listed under [Non-goals](#non-goals) and is
deliberately absent from the codebase.

## Product summary

Abhinay is a networking platform for film professionals. A person can create an
account under a professional role, sign in, maintain a professional profile
(photo, bio, location, contact, skills, credits), and share a public version of
that profile with anyone — logged in or not. Producers and directors can post
casting roles; every signed-in member can browse and search the open ones and
apply to those cast for their own profession.

## Roles

| Role                                                                       | Public registration | Notes                                                                                                                                                                                        |
| -------------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ACTOR`, `DIRECTOR`, `PRODUCER`, `CAMERA_OPERATOR`, `EDITOR`, `OTHER_CREW` | Yes                 | Chosen at registration, displayed on the profile, not editable afterwards. `PRODUCER` and `DIRECTOR` may post casting roles.                                                                 |
| `ADMIN`                                                                    | **No**              | Assigned out of band (database or a seed run with operator-supplied credentials). A registration request that injects `ADMIN` fails server-side with 422 even though the UI never offers it. |

## 1.1.1 User Registration & Authentication

| #   | Requirement                                                                                                                                                                               | Where it is implemented                                                                          | Test evidence                                                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| A1  | Register with name, email, password and one of the six public roles; a profile is created in the same transaction.                                                                        | `apps/backend/src/services/auth.service.ts`                                                      | `tests/integration/auth.test.ts`                                  |
| A2  | Email is trimmed and lowercased before validation, storage and lookup; uniqueness is enforced by a database constraint, including under concurrent registration.                          | `src/validators/common.ts`, `prisma/schema.prisma`                                               | `tests/integration/auth.test.ts`, `tests/unit/validators.test.ts` |
| A3  | Passwords are bcrypt-hashed, never logged, never returned. Policy: at least 6 characters (lowered from 12 in Week 9), at most 72 UTF-8 bytes; passwords are never trimmed or case-folded. | `src/utils/password.ts`                                                                          | `tests/unit/validators.test.ts`, `tests/integration/auth.test.ts` |
| A4  | Login returns a short-lived access token plus a safe user DTO, and sets a long-lived `HttpOnly` refresh cookie. Invalid email and wrong password are indistinguishable.                   | `src/services/auth.service.ts`, `src/controllers/auth.controller.ts`                             | `tests/integration/auth.test.ts`                                  |
| A5  | `GET /auth/me` returns the current user, with the role read from the database rather than the token claim.                                                                                | `src/middleware/auth.middleware.ts`                                                              | `tests/integration/auth.test.ts`                                  |
| A6  | Refresh rotates the session atomically; expired, revoked or reused tokens return 401, and concurrent use of one token succeeds at most once.                                              | `src/services/auth.service.ts`                                                                   | `tests/integration/auth.test.ts`                                  |
| A7  | Logout revokes the presented refresh session, clears the cookie with matching attributes, and is idempotent — including when the access token has already expired.                        | `src/controllers/auth.controller.ts`                                                             | `tests/integration/auth.test.ts`                                  |
| A8  | RBAC: `authenticate` establishes identity (401 when absent/invalid), `requireRole` enforces role policy (403 when denied). Demonstrated by the read-only `GET /admin/users`.              | `src/middleware/role.middleware.ts`, `src/controllers/admin.controller.ts`                       | `tests/integration/auth.test.ts`                                  |
| A9  | Credentialed CORS for exactly one configured origin; `Origin` validated on state-changing requests; `X-Abhinay-Client: web` required on the cookie-authenticated endpoints.               | `src/app.ts`, `src/middleware/origin.middleware.ts`                                              | `tests/integration/auth.test.ts`                                  |
| A10 | Auth endpoints are rate limited with configurable window and maximum.                                                                                                                     | `src/routes/auth.routes.ts`                                                                      | `tests/integration/auth.test.ts`                                  |
| A11 | Browser: register, login, protected navigation, session restoration across reload, logout, and redirect of unauthenticated users to login with a validated internal return destination.   | `apps/frontend/src/hooks/useAuth.tsx`, `src/lib/api.ts`, `src/components/common/RequireAuth.tsx` | `tests/e2e/flows.spec.ts`                                         |

## 1.1.2 Professional Profile Management

| #   | Requirement                                                                                                                                                                                                                                                                      | Where it is implemented                                                                     | Test evidence                                                             |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| P1  | Every user has exactly one profile, created with the account.                                                                                                                                                                                                                    | `prisma/schema.prisma`, `src/services/auth.service.ts`                                      | `tests/integration/auth.test.ts`                                          |
| P2  | Owner view returns name, email, role, bio, location, phone, photo, skills and credits.                                                                                                                                                                                           | `src/services/dto.ts`                                                                       | `tests/integration/profile.test.ts`                                       |
| P3  | Editable scalars are name, bio, location and phone. Email and role are read-only. An empty value clears an optional field.                                                                                                                                                       | `src/validators/profile.validator.ts`, `src/services/profile.service.ts`                    | `tests/integration/profile.test.ts`                                       |
| P4  | Skills: add, list and remove. Skill identity is normalized, duplicate links are impossible, adding an existing skill is idempotent, and removal deletes only the caller's join row.                                                                                              | `src/services/profile.service.ts`                                                           | `tests/integration/profile.test.ts`                                       |
| P5  | Experience: create, list, edit and delete with title, organization, optional description, start date and optional end date. Dates are real calendar dates in `YYYY-MM-DD`; an end date may not precede the start date; a null end date means ongoing. Ordering is deterministic. | `src/validators/profile.validator.ts`, `src/services/profile.service.ts`                    | `tests/integration/profile.test.ts`, `tests/unit/validators.test.ts`      |
| P6  | Ownership is enforced inside the database mutation predicate, so changing an id in a request cannot touch another user's row.                                                                                                                                                    | `src/services/profile.service.ts`                                                           | `tests/integration/profile.test.ts`                                       |
| P7  | Photo upload works end to end against local storage: validated, re-encoded, stored under opaque names, served from a dedicated public path, and replaceable without ever losing the previous working image on failure.                                                           | `src/services/image.service.ts`, `src/config/storage.ts`, `src/services/profile.service.ts` | `tests/integration/photo.test.ts`, `tests/unit/image-and-storage.test.ts` |
| P8  | Public profile by `Profile.id` is readable without login and excludes email, phone, user id, password hash and all session data.                                                                                                                                                 | `src/services/dto.ts`, `src/routes/profile.routes.ts`                                       | `tests/integration/profile.test.ts`, `tests/e2e/flows.spec.ts`            |
| P9  | The edit experience keeps scalar, skills, experience and photo sections independent: a successful sub-operation never discards unsaved scalar edits.                                                                                                                             | `apps/frontend/src/app/profile/edit/page.tsx`                                               | `tests/e2e/flows.spec.ts`                                                 |
| P10 | After a name or photo change, header, dashboard and profile agree without a manual reload.                                                                                                                                                                                       | `apps/frontend/src/hooks/useAuth.tsx`, `src/app/profile/edit/page.tsx`                      | `tests/e2e/flows.spec.ts`                                                 |

## 1.2 Casting Marketplace — 1.2.1 and 1.2.2

Traces to Lab 2 **FR-02** (producers/directors publish postings with
description, requirements, compensation and location) and **FR-03** (actors and
crew browse, search and apply). Shortlist folders (1.2.3) are the next increment.

| #   | Requirement                                                                                                                                                                                                       | Where it is implemented                                                            | Test evidence                                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| C1  | Producers and directors create casting roles with title, description, requirements, compensation, location and the profession sought. Every other role, including `ADMIN`, gets 403.                              | `apps/backend/src/routes/casting.routes.ts`, `src/validators/casting.validator.ts` | `tests/integration/casting.test.ts`                                                   |
| C2  | A new role is a DRAFT visible only to its author; anyone else gets the same 404 as for an unknown id.                                                                                                             | `src/services/casting.service.ts`                                                  | `tests/integration/casting.test.ts`, `tests/e2e/casting.spec.ts`                      |
| C3  | Lifecycle DRAFT → OPEN → CLOSED stamps `publishedAt`/`closedAt`. Repeating the current status is idempotent; any other move is 409; a concurrent publish happens exactly once.                                    | `src/services/casting.service.ts`                                                  | `tests/integration/casting.test.ts`                                                   |
| C4  | The author edits a DRAFT or OPEN role; a CLOSED role is final (409). Only a DRAFT can be deleted (409 otherwise).                                                                                                 | `src/services/casting.service.ts`                                                  | `tests/integration/casting.test.ts`, `tests/e2e/casting.spec.ts`                      |
| C5  | Ownership is enforced inside every mutation predicate: another poster gets 404 and nothing changes.                                                                                                               | `src/services/casting.service.ts`                                                  | `tests/integration/casting.test.ts`                                                   |
| C6  | Every signed-in user browses OPEN roles, newest first, paginated (at most 50 per page).                                                                                                                           | `src/services/casting.service.ts`, `apps/frontend/src/app/casting/page.tsx`        | `tests/integration/casting.test.ts`, `tests/e2e/casting.spec.ts`                      |
| C7  | Search matches title, description, requirements and location, ignoring case, with `%` and `_` taken literally; filters narrow by profession and location.                                                         | `src/services/casting.service.ts`, `src/validators/casting.validator.ts`           | `tests/integration/casting.test.ts`, `tests/e2e/casting.spec.ts`                      |
| C8  | Casting responses expose only the poster's public profile facts — never email, phone or user id.                                                                                                                  | `src/services/dto.ts`                                                              | `tests/integration/casting.test.ts`                                                   |
| C9  | Strict schemas reject server-managed keys (`status`, `createdById`, `publishedAt`) with 422; the client schema mirrors every bound.                                                                               | `src/validators/casting.validator.ts`, `apps/frontend/src/lib/validation.ts`       | `tests/unit/casting-validators.test.ts`, `tests/integration/casting.test.ts`          |
| C10 | Browser: post (draft or publish), detail with owner controls and confirmations, edit, "My postings" with status tabs, browse with shareable URL filters; loading, empty, error, not-found and not-allowed states. | `apps/frontend/src/app/casting/*`, `src/components/casting/*`                      | `tests/e2e/casting.spec.ts`                                                           |
| C11 | A member applies to an OPEN role only when their current profession is the role's `seekingRole`; the author never can; anyone else gets 403 `NOT_ELIGIBLE`. (Rule chosen by the client in Week 9.)                | `apps/backend/src/services/application.service.ts`                                 | `tests/integration/applications.test.ts`, `tests/e2e/applications.spec.ts`            |
| C12 | One application per member per role, enforced by a unique constraint: a repeat is 409 `ALREADY_APPLIED`, and concurrent attempts create exactly one.                                                              | `prisma/schema.prisma`, `src/services/application.service.ts`                      | `tests/integration/applications.test.ts`                                              |
| C13 | Drafts take no applications (404) and closed roles none (409 `CASTING_ROLE_NOT_OPEN`); the role row is locked while applying, so none lands on a role closed first.                                               | `src/services/application.service.ts`                                              | `tests/integration/applications.test.ts`                                              |
| C14 | Applications start as `APPLIED` (the four Lab 2 statuses exist); members list their own, newest first, filterable by status, and they stay listed after the role closes.                                          | `src/services/application.service.ts`, `src/routes/application.routes.ts`          | `tests/integration/applications.test.ts`, `tests/unit/application-validators.test.ts` |
| C15 | The role page shows the member's own application and status; the author sees only how many have applied, never who (that is WBS 1.2.3/1.3).                                                                       | `src/services/dto.ts`, `apps/frontend/src/components/casting/ApplyPanel.tsx`       | `tests/integration/applications.test.ts`, `tests/e2e/applications.spec.ts`            |
| C16 | Browser: apply with an explicit confirmation, eligibility explained instead of a dead button, "My applications" page, dashboard card.                                                                             | `apps/frontend/src/app/applications/page.tsx`, `src/components/casting/*`          | `tests/e2e/applications.spec.ts`                                                      |

## Cross-cutting requirements

- One documented response envelope for every endpoint, with machine-readable
  error codes and per-field validation errors; a 204 carries no body.
- Explicit safe projections: no Prisma record is ever serialized directly.
- Distinct status codes for validation (422), malformed requests (400),
  authentication (401), role denial (403), missing or unowned resources (404),
  duplicate email (409), oversized payloads (413), unsupported media (415) and
  throttling (429).
- Strict TypeScript, ESLint and Prettier across both workspaces, with no
  `any`-based escapes or disabled strict mode.
- Startup validation of environment configuration, including distinct,
  non-placeholder JWT secrets.
- Integration tests run against real PostgreSQL and real migrations, on a
  database whose name must end in `_test`.

## Non-goals

Not implemented anywhere in the repository yet:

- Shortlist folders, the author's applicant list and moving an application's
  status (WBS 1.2.3, 1.3) — the next casting increments. Applications cannot be
  withdrawn.
- Direct messaging, audition scheduling, self-tapes.
- Project pages, crew linking, social feed.
- Admin dashboard or user-management subsystem. `GET /admin/users` exists only
  as a read-only demonstration that role policy is enforced on the server.
- Account deletion, password reset, email verification.
- Cloud storage integration, deployment, paid services.
- Role-specific profile fields (measurements, rates, availability). The plan
  does not define them, so none were invented.

Messages appears on the dashboard only as a visibly disabled placeholder: no
links, no endpoints, no tables.

### Deferred from WBS 1.1

The approved WBS (Lab 3) and FR-01 include **1.1.2.2 portfolio / resume-CV
upload** and the **reel** half of **1.1.2.3 photo & reel upload**. Neither is
built: both need cloud media storage, so they are planned alongside **1.4.3
Self-Tape Submission**, which needs the same storage. The `ProfilePhotoStorage`
interface in `apps/backend/src/config/storage.ts` is the seam for that adapter.

## Week mapping

| Week | Deliverable                                                                                                                                                            |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W1   | Requirements, architecture, repository layout, tooling, environment validation, documentation.                                                                         |
| W2   | Data model, migrations, API contract.                                                                                                                                  |
| W3   | Express foundation, authentication, RBAC, Postman collection.                                                                                                          |
| W4   | Next.js authentication, dashboard, settings, API client, session handling.                                                                                             |
| W5   | Profile view/edit, skills, experience, photo upload, public profile page.                                                                                              |
| W9   | Repository hygiene; WBS 1.2.1 and 1.2.2: casting role posting, browse, search and apply (scheduled for W6–7 in Lab 6); theme completed; password minimum lowered to 6. |

Detailed status per deliverable, with file paths and test evidence, is in
[`week-1-5-status.md`](week-1-5-status.md) and
[`week-6-9-status.md`](week-6-9-status.md).
