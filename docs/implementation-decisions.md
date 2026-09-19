# Implementation Decisions

Engineering choices that the plan for WBS 1.1 left open, plus the places where
this repository deviates from the plan's illustrative examples. Each entry says
what was chosen, why, and where the behaviour is tested.

## Repository layout

**Decision.** The workspaces are `apps/frontend` and `apps/backend`, not
`client/` and `server/`.

The plan sketches a `client/` + `server/` tree; this repository already existed
with `apps/*` npm workspaces, a working root `package.json` and committed
migrations. Renaming would have churned every import path and the migration
history for a cosmetic match. The plan explicitly allows preserving an existing
functional arrangement. The mapping is one-to-one: `client/src/*` →
`apps/frontend/src/*`, `server/src/*` → `apps/backend/src/*`.

**Decision.** One `.env` at the repository root rather than one per workspace.

Both workspaces are started from root scripts and share `PORT`,
`FRONTEND_URL`, `PUBLIC_SERVER_URL` and `NEXT_PUBLIC_API_URL`; duplicating them
in two files is how they drift apart. `.env.example` and `.env.test.example`
document every variable, and `apps/backend/src/config/env.ts` resolves the root
`.env` explicitly rather than depending on the current working directory.

## API surface

**Decision.** Paths are `/api/v1/...`, not `/api/...`.

The `v1` prefix was established in the Week-1 code and documentation. The plan's
tables are written as `/api/auth/register`; the implemented equivalent is
`/api/v1/auth/register`. The refresh cookie path follows the same prefix
(`/api/v1/auth`) so it is still scoped to exactly the endpoints that read it.

**Decision.** The response envelope keeps the Week-1 `success` / `message`
fields and adds `error.code` and `error.fieldErrors`.

The plan suggests `{ data }` / `{ error: { code, message, fieldErrors } }`. The
existing contract already had `success` and `message`, and clients and the
conventions doc depended on them. Rather than break that, the error object was
added alongside: every response is `{ success, message, data }` or
`{ success, message, error: { code, message, fieldErrors? } }`. The required
information — a machine-readable code and per-field errors — is present.
A `204` still carries no body (`sendNoContent`).

**Decision.** Validation failures are `422`, not `400`.

`400` is reserved for requests that are malformed before validation can run
(bad JSON, a missing multipart field). This split was already in place and is
what the frontend branches on.

## Tokens and sessions

| Choice                  | Value                                                                                                         | Rationale                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Access token transport  | `Authorization: Bearer`, kept in a module-scope variable in the browser                                       | Not readable through `localStorage`/`sessionStorage` by injected script, and gone when the tab closes                               |
| Access token lifetime   | 15 minutes (`ACCESS_TOKEN_EXPIRES_IN`)                                                                        | Plan default                                                                                                                        |
| Refresh token transport | `refreshToken` HttpOnly cookie, `Path=/api/v1/auth`, `SameSite=Lax`, `Secure` only when `NODE_ENV=production` | Local HTTP development works without weakening production; `Lax` still restores a session for a user arriving from an external link |
| Refresh token lifetime  | 7 days (`REFRESH_TOKEN_EXPIRES_IN`)                                                                           | Plan default                                                                                                                        |
| Refresh persistence     | SHA-256 digest in `refresh_tokens.token_hash`, never the raw token                                            | A database leak yields no usable bearer tokens. This replaces the plan's illustrative raw `token` column                            |
| bcrypt cost             | 12 in development, 4 in tests (`BCRYPT_ROUNDS`)                                                               | ~250 ms per hash locally is a reasonable brute-force cost; the test value keeps the suite fast and is confined to `.env.test`       |

**Logout semantics.** Logout revokes the presented refresh session and clears
the cookie. It does **not** invalidate access tokens already issued; those
expire normally within 15 minutes. `tests/integration/auth.test.ts` asserts this
actual behaviour rather than a false claim of global logout, and the README and
API reference state it.

**Interrupted-rotation recovery.** Rotation is single-use, but a rotation whose
response never reaches the browser — a navigation cancels the request, the
connection drops — would otherwise strand a session that did nothing wrong: the
server consumed the token and the client never stored the replacement. This was
observed in the browser suite, not hypothesised.

Two mitigations, both needed:

1. The client sends `/auth/refresh` and `/auth/logout` with `keepalive: true`,
   so a navigation cannot abort them mid-flight (`apps/frontend/src/lib/api.ts`).
2. The server accepts a consumed token for 10 seconds after its rotation,
   **only** when its replacement has not itself been used, and then consumes the
   replacement and issues a fresh token
   (`recoverInterruptedRotation` in `apps/backend/src/services/auth.service.ts`).

The tradeoff is explicit: inside that 10-second window a stolen old token is
also accepted. Outside the window, or once the replacement has been used, the
old token is reuse and returns `401`. Concurrent use of one token still yields
at most one success. All three cases are covered in
`tests/integration/auth.test.ts`.

**Browser refresh coordination.** One in-flight refresh at a time, at most one
retry per eligible request, never on `403`, never on the auth endpoints
themselves, and a session epoch counter so a refresh that was in flight during
logout cannot install a token afterwards.

**Sign-out and `returnTo`.** A guard redirect carries
`?returnTo=<path>` so an interrupted deep link resumes after login, but a
deliberate logout redirects to a bare `/login` — the user is not trying to
reach the page they just left. Only same-origin, path-only destinations are
honoured (`safeReturnTo`), which closes the open-redirect hole.

## Privacy and projections

- Public profiles expose `id`, `name`, `role`, `bio`, `location`, `photoUrl`,
  `skills`, `experiences`. Email, phone, `userId` and timestamps are excluded.
  The owner projection adds `email`, `phone`, `userId` and timestamps.
- Every response body is built by an explicit function in
  `apps/backend/src/services/dto.ts`. No Prisma record is ever spread into a
  response, so a new column cannot leak by accident.
- `PUT /profile/me` uses a `.strict()` schema, so `role`, `email`,
  `passwordHash`, `userId`, `profileImage` and friends produce `422` rather than
  being silently dropped.

## Identifiers

`GET /profile/:id` takes a **`Profile.id`**. Skill removal takes a
**`ProfileSkill.id`** (returned as `skill.id`, with the shared `Skill.id`
alongside as `skill.skillId`), so removing a skill can only ever delete the
caller's own join row. Experience mutations take an **`Experience.id`**. All are
opaque UUIDs. A syntactically invalid id on a public route is answered `404`,
not `422` — to an anonymous caller a malformed id is simply a profile that does
not exist.

## Skills

Skill identity is the display name trimmed, whitespace-collapsed and lowercased
(`normalizedName`, uniquely indexed). The first-seen display casing is kept for
presentation. Adding a skill already on the profile returns **`200`** with the
existing link; a genuinely new link returns **`201`**. Bounds: 2–40 characters,
30 skills per profile, mirrored in the client-side schema.

## Experience dates

`YYYY-MM-DD` strings on the wire, PostgreSQL `date` columns in storage (not
`timestamp`), parsed and re-serialised at UTC midnight. Dates are round-tripped
during validation so `2025-02-30` is rejected instead of rolling into March. A
null `endDate` means ongoing. Ordering is `startDate` descending with `id` as a
deterministic tie-break, matched exactly by the client so the list does not jump
after a save.

## Uploads and storage

- `POST /profile/photo`, multipart field `photo`; `DELETE /profile/photo` backs
  the remove control.
- Policy: one JPEG/PNG/WebP file, ≤ 5 MiB, ≤ 6000 px per side. Files are
  buffered in memory and decoded by `sharp`; the extension and client MIME type
  are only a cheap early reject.
- Accepted images are re-encoded to a 512×512 WebP. Re-encoding normalises the
  format, strips EXIF, and means nothing the client sent is served back
  verbatim. SVG, renamed executables and truncated files fail to decode and are
  rejected with `415`.
- `ProfilePhotoStorage` is a three-method interface with a filesystem
  implementation. A cloud adapter would implement the same interface; no cloud
  provider is integrated in this phase.
- Keys are generated UUID filenames, never derived from a client filename, and
  every path is re-validated to be inside the storage root before any
  filesystem call — including on delete.
- Only the processed-photo directory is served, at `/media/profile-photos`,
  from the Express origin. Absolute URLs are built from `PUBLIC_SERVER_URL`,
  never from the request `Host` header. Originals are never written to disk.
- Write order on replacement: validate → write new file → update row → delete
  the superseded file. A failed database write removes the new file and leaves
  the previous photo reference intact.
- The avatar fallback is locally rendered initials, with no third-party service.

## RBAC demonstration

`GET /admin/users` is read-only, paginated (`pageSize` ≤ 100) and returns only
the safe user projection. It exists to prove `requireRole(ADMIN)` is enforced
server-side. There is no admin dashboard, no mutation endpoint and no
role-promotion API. Admin fixtures are created directly in the test database;
`npm run db:seed` creates a demo admin only when `SEED_ADMIN_EMAIL` and
`SEED_ADMIN_PASSWORD` are both supplied, and refuses to run with
`NODE_ENV=production`.

## Validation split

`authenticate` verifies the access token and then reads the current role from
the database, so a role change takes effect on the next request rather than at
the next login. The cost is one indexed lookup per authenticated request, which
is the right trade at this scale.

Client-side schemas in `apps/frontend/src/lib/validation.ts` mirror the server
bounds exactly and exist only for fast feedback; the server remains the
authority. React Hook Form resolvers on the two forms with type-changing
transforms use `{ raw: true }`, so a handler always receives the strings the
inputs hold and converts them once, deliberately.

## Testing infrastructure

- Vitest for unit and integration tests, Supertest for HTTP, Playwright for the
  browser. Integration tests import the real `app.ts` and hit real PostgreSQL
  through real migrations.
- `tests/env.setup.ts` refuses to run unless `DATABASE_URL` names a database
  ending in `_test`, so `TRUNCATE` can never reach development data.
- Integration tests run single-threaded against one database; the browser suite
  runs the built frontend and compiled backend on ports 3100/5100 with
  `STORAGE_ROOT=storage-e2e`, so a running `npm run dev` is undisturbed.
- Token expiry is tested by signing tokens with a negative lifetime, not by
  sleeping.

## Known gaps

- Refresh-token rows are not garbage-collected; revoked and expired rows
  accumulate. A periodic cleanup belongs with the deployment work, which is out
  of scope.
- `AUTH_RATE_LIMIT_*` is in-process, so it resets on restart and is per-instance.
  A shared store was explicitly ruled out for a local stack.
- Profile photos are stored on the local filesystem. The storage interface is
  the seam for a cloud adapter; integrating one is a later phase.
- Role is fixed at registration. No endpoint changes it, by design.
