# Requirements — WBS 1.1 User Management & Profiles

Scope of this document: **WBS 1.1.1 User Registration & Authentication** and
**WBS 1.1.2 Professional Profile Management**, delivered across Weeks 1–5.
Everything outside those two work packages is listed under [Non-goals](#non-goals)
and is deliberately absent from the codebase.

## Product summary

Abhinay is a networking platform for film professionals. In this phase a person
can create an account under a professional role, sign in, maintain a
professional profile (photo, bio, location, contact, skills, credits), and share
a public version of that profile with anyone — logged in or not.

## Roles

| Role                                                                       | Public registration | Notes                                                                                                                                                                                        |
| -------------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ACTOR`, `DIRECTOR`, `PRODUCER`, `CAMERA_OPERATOR`, `EDITOR`, `OTHER_CREW` | Yes                 | Chosen at registration, displayed on the profile, not editable afterwards in this phase.                                                                                                     |
| `ADMIN`                                                                    | **No**              | Assigned out of band (database or a seed run with operator-supplied credentials). A registration request that injects `ADMIN` fails server-side with 422 even though the UI never offers it. |

## 1.1.1 User Registration & Authentication

| #   | Requirement                                                                                                                                                                             | Where it is implemented                                                                          | Test evidence                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| A1  | Register with name, email, password and one of the six public roles; a profile is created in the same transaction.                                                                      | `apps/backend/src/services/auth.service.ts`                                                      | `tests/integration/auth.test.ts`                                  |
| A2  | Email is trimmed and lowercased before validation, storage and lookup; uniqueness is enforced by a database constraint, including under concurrent registration.                        | `src/validators/common.ts`, `prisma/schema.prisma`                                               | `tests/integration/auth.test.ts`, `tests/unit/validators.test.ts` |
| A3  | Passwords are bcrypt-hashed, never logged, never returned. Policy: at least 12 characters, at most 72 UTF-8 bytes; passwords are never trimmed or case-folded.                          | `src/utils/password.ts`                                                                          | `tests/unit/validators.test.ts`, `tests/integration/auth.test.ts` |
| A4  | Login returns a short-lived access token plus a safe user DTO, and sets a long-lived `HttpOnly` refresh cookie. Invalid email and wrong password are indistinguishable.                 | `src/services/auth.service.ts`, `src/controllers/auth.controller.ts`                             | `tests/integration/auth.test.ts`                                  |
| A5  | `GET /auth/me` returns the current user, with the role read from the database rather than the token claim.                                                                              | `src/middleware/auth.middleware.ts`                                                              | `tests/integration/auth.test.ts`                                  |
| A6  | Refresh rotates the session atomically; expired, revoked or reused tokens return 401, and concurrent use of one token succeeds at most once.                                            | `src/services/auth.service.ts`                                                                   | `tests/integration/auth.test.ts`                                  |
| A7  | Logout revokes the presented refresh session, clears the cookie with matching attributes, and is idempotent — including when the access token has already expired.                      | `src/controllers/auth.controller.ts`                                                             | `tests/integration/auth.test.ts`                                  |
| A8  | RBAC: `authenticate` establishes identity (401 when absent/invalid), `requireRole` enforces role policy (403 when denied). Demonstrated by the read-only `GET /admin/users`.            | `src/middleware/role.middleware.ts`, `src/controllers/admin.controller.ts`                       | `tests/integration/auth.test.ts`                                  |
| A9  | Credentialed CORS for exactly one configured origin; `Origin` validated on state-changing requests; `X-Abhinay-Client: web` required on the cookie-authenticated endpoints.             | `src/app.ts`, `src/middleware/origin.middleware.ts`                                              | `tests/integration/auth.test.ts`                                  |
| A10 | Auth endpoints are rate limited with configurable window and maximum.                                                                                                                   | `src/routes/auth.routes.ts`                                                                      | `tests/integration/auth.test.ts`                                  |
| A11 | Browser: register, login, protected navigation, session restoration across reload, logout, and redirect of unauthenticated users to login with a validated internal return destination. | `apps/frontend/src/hooks/useAuth.tsx`, `src/lib/api.ts`, `src/components/common/RequireAuth.tsx` | `tests/e2e/flows.spec.ts`                                         |

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

Out of scope for Weeks 1–5, and intentionally not implemented anywhere in the
repository:

- Casting marketplace, role postings, applications, shortlists, applicant status.
- Direct messaging, audition scheduling, self-tapes.
- Project pages, crew linking, social feed.
- Admin dashboard or user-management subsystem. `GET /admin/users` exists only
  as a read-only demonstration that role policy is enforced on the server.
- Account deletion, password reset, email verification.
- Cloud storage integration, deployment, paid services.
- Role-specific profile fields (measurements, rates, availability). The plan
  does not define them, so none were invented.

Applications and Messages appear on the dashboard only as visibly disabled
placeholders: no links, no endpoints, no tables.

## Week mapping

| Week | Deliverable                                                                                    |
| ---- | ---------------------------------------------------------------------------------------------- |
| W1   | Requirements, architecture, repository layout, tooling, environment validation, documentation. |
| W2   | Data model, migrations, API contract.                                                          |
| W3   | Express foundation, authentication, RBAC, Postman collection.                                  |
| W4   | Next.js authentication, dashboard, settings, API client, session handling.                     |
| W5   | Profile view/edit, skills, experience, photo upload, public profile page.                      |

Detailed status per deliverable, with file paths and test evidence, is in
[`week-1-5-status.md`](week-1-5-status.md).
