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

_Weeks 1–5 kept profile photos on the local filesystem. Week 10 moved every
upload to Cloudinary; see [Media storage on Cloudinary](#media-storage-on-cloudinary-week-10).
What still holds from the original design:_

- `POST /profile/photo`, multipart field `photo`; `DELETE /profile/photo` backs
  the remove control.
- Policy: one JPEG/PNG/WebP file, ≤ 5 MiB, ≤ 6000 px per side, decoded by
  `sharp`; the extension and client MIME type are only a cheap early reject.
- Accepted images are re-encoded to a 512×512 WebP. Re-encoding normalises the
  format, strips EXIF, and means nothing the client sent is served back
  verbatim. SVG, renamed executables and truncated files fail to decode and are
  rejected with `415`.
- Keys are generated UUIDs, never derived from a client filename. The local
  driver re-validates every path to be inside its directory before any
  filesystem call — including on delete.
- Write order on replacement: validate → store new file → update row → delete
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

## Casting (WBS 1.2.1, 1.2.2.1)

**Who posts.** `PRODUCER` and `DIRECTOR`, per Lab 2 FR-02, enforced with
`requireRole` on every write and on `/casting/mine`. `ADMIN` is not a poster;
moderation is WBS 1.6. The role check runs before the ownership check, so a
non-poster always gets `403` and a poster touching someone else's role gets
`404` — the same answer as for an id that does not exist.

**Who reads.** Every signed-in user. Browsing requires a session (unlike the
public profile page), as agreed when the increment was approved.

**Lifecycle.** `DRAFT → OPEN → CLOSED`, moved only by
`PATCH /casting/:id/status`. Create always makes a draft; the UI's "Publish
role" is create followed by publish, and if the second call fails the draft's
page says so instead of pretending nothing happened.

| Choice                         | Rationale                                                                                                   |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `CLOSED` is final              | Reopening was not a requirement, and a final state keeps future applications unambiguous                    |
| Only drafts can be deleted     | Nobody else has seen a draft; a published role is closed so any link to it still resolves                   |
| A draft is a `404` to others   | Not `403`: probing ids must not reveal that a draft exists                                                  |
| Same-status `PATCH` is a `200` | Idempotent, like re-adding a skill; a retry or a lost race is not an error                                  |
| Other moves are `409`          | `INVALID_STATUS_TRANSITION`, `CASTING_ROLE_CLOSED`, `CASTING_ROLE_NOT_DRAFT` let the client say exactly why |

Ownership and the status guard live in the conditional write
(`updateMany`/`deleteMany` with `createdById` and `status` in the predicate),
the same pattern as experiences and refresh rotation. Concurrent publishes
therefore perform the transition once, and every caller sees the same
`publishedAt`.

**Fields.** Exactly what FR-02 lists — description, requirements, compensation,
location — plus a title and `seekingRole`, the profession sought. `seekingRole`
reuses the `Role` enum and the validator restricts it to the six public roles.
Compensation and location are free text. An optional application deadline was
added in Week 10 at the client's request — see
[Application deadlines](#application-deadlines-week-10). A nullable link to a
project can be added when WBS 1.5 introduces project pages.

**Search.** A case-insensitive substring match (`ILIKE`) over title,
description, requirements and location, plus exact `seekingRole` and substring
`location` filters. Prisma does not escape `LIKE` wildcards in `contains` — the
integration suite caught a search for "100%" also matching "1000" — so `%`, `_`
and `\` are escaped before the query. A sequential scan is fine at this scale;
`pg_trgm` is the upgrade path.

**Projections.** Lists return a summary with a 200-character
`descriptionPreview` (cut on a code-point boundary, so an emoji is never split);
the detail adds the full text and `isOwner`. The poster appears as
`{ profileId, name, role, photoUrl }`, never email, phone or user id.

**Paths.** `/api/v1/casting`, the naming agreed for this increment, under the
existing `v1` prefix. `PATCH` was added to the CORS method allowlist; without it
the browser's preflight rejects status changes before they are sent.

**Frontend.**

- Filters live in the URL, so a search can be shared and restored by the back
  button.
- Loading is derived from a request key instead of a synchronous `setState`
  in an effect, matching the existing pages.
- New pages use the shadcn semantic tokens (`bg-primary`, `text-primary`). The
  header and dashboard additions copy their neighbours' `brand-*` classes so
  they stay consistent; since the theme completion both resolve to the same
  primary.
- Destructive actions (close, delete) ask for an inline confirmation and move
  focus to it.

## Applications (WBS 1.2.2.2)

**Who may apply.** A member whose **current** profession — the role read from
the database on every request — equals the role's `seekingRole`, and who is not
the role's author. The client chose this rule in Week 9 over "any signed-in
member". Consequences: a director can apply to a role casting for a director, a
producer to one casting for a producer, and `ADMIN` never qualifies because
`seekingRole` can never be `ADMIN`.

| Situation                             | Answer                      | Why                                                     |
| ------------------------------------- | --------------------------- | ------------------------------------------------------- |
| Unknown role, or someone else's draft | `404 NOT_FOUND`             | Drafts stay invisible, exactly as on `GET /casting/:id` |
| Own role                              | `403 NOT_ELIGIBLE`          | Policy, not state                                       |
| Role not `OPEN`                       | `409 CASTING_ROLE_NOT_OPEN` | State: the same request would have worked earlier       |
| Wrong profession                      | `403 NOT_ELIGIBLE`          | Policy                                                  |
| Second application                    | `409 ALREADY_APPLIED`       | State, decided by the unique constraint                 |

**Concurrency.** Two guarantees, two mechanisms. _One application per member
per role_ is the unique pair `(casting_role_id, applicant_id)`; the loser of a
race gets `P2002`, translated to `409` exactly like a duplicate email. _No
application on a closed role_ is a `SELECT … FOR SHARE` of the role inside the
inserting transaction: a concurrent close is an `UPDATE` of that row, so it
waits until the application commits — or the apply sees `CLOSED` and refuses.
This is the codebase's only raw query, and it is parameterised.

**No body.** `POST /casting/:id/applications` takes an empty strict object.
Who applies comes from the token; a cover note was not in the requirements, so
none was invented. Adding one later is an additive nullable column.

**No withdrawal.** The Lab 2 lifecycle has no withdrawn state, so an application
is final. The UI says so before the member confirms.

**What the author sees.** `applicationCount` on the role page; since Week 10,
who applied on the applicants page, built with shortlists (see below).

**Statuses.** All four Lab 2 statuses exist in the enum now, so WBS 1.3 changes
behaviour, not the schema. Only `APPLIED` is reachable in this increment.

## Application deadlines (Week 10)

**Shape.** `casting_roles.application_deadline`, a nullable PostgreSQL `date`:
the last calendar day on which applications are accepted. A date rather than a
timestamp because posters think in days ("apply by 31 October"), and a date
cannot drift with the viewer's time zone. Optional, because Lab 2 does not
require one and "open until filled" is a real casting practice.

**Which "today".** One platform zone, `APP_TIME_ZONE` (default
`Asia/Kolkata`), decides the current date for every rule. `src/utils/calendar.ts`
expresses "today" as UTC midnight so it compares directly with the stored
`date`. The browser validates against its own date for quick feedback; the
server is the authority, so the two can differ only around midnight.

| Choice                                                    | Rationale                                                                                   |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| A new deadline must be today … today + 365 days           | A past deadline is a typo; a far-future one is almost certainly a wrong year                |
| An expired deadline may be re-sent unchanged on edit      | Otherwise the author could not fix a typo in the title of a role whose deadline just passed |
| Past the deadline the role stays `OPEN`                   | No scheduler is needed, nothing changes behind the author's back, and extending reopens it  |
| …but is hidden from browse and refuses applications (409) | `acceptingApplications` is computed in the DTO, so every client agrees on one rule          |
| The deadline day itself still accepts applications        | "Apply by 31 Oct" means through the 31st                                                    |
| Publishing a draft whose deadline has passed is `409`     | It would be listed nowhere and accept nobody; the deadline is part of the publish predicate |
| The apply check runs inside the `FOR SHARE` transaction   | Same place as the status check, so the two rules cannot disagree                            |

**Browse.** `sort=newest|oldest|deadline` (`deadline` puts the soonest first and
roles without one last) and `deadlineBefore=YYYY-MM-DD` ("closing soon"). `q`
now also matches compensation, so "unpaid" or "per day" find something.

## Shortlist folders (WBS 1.2.3, Week 10)

**Scope reconciliation.** The client's Week-10 brief listed shortlisting as a
later phase, but Lab 3 places **1.2.3 Shortlist Management** inside WBS 1.2; the
client chose to build it now. It needs the author's applicant list, which is
also WBS 1.3.1.1 ("view applicants per posting"), so that list is built here.
Moving an application to `SHORTLISTED`/`SELECTED`/`REJECTED` and notifying the
applicant remain WBS 1.3.

| Choice                                             | Rationale                                                                                                |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Folders belong to one casting role                 | Ownership follows the role, and "Callbacks" for one part means nothing for another                       |
| An application may be in several folders           | "Strong" and "Second round" are not exclusive; a join table costs nothing extra                          |
| Filing never changes `status` and never notifies   | Folders are the author's private working notes; status is the visible, notified decision of WBS 1.3      |
| Names unique per role ignoring case and spacing    | `normalized_name` + unique index, the same pattern as skills; a race still yields one folder and a `409` |
| ≤ 20 folders per role, enforced under a row lock   | Two concurrent creates cannot both take the last slot                                                    |
| Filing is idempotent (`201` new, `200` existing)   | Same contract as adding a skill; a double click or retry is not an error                                 |
| `PUT …/applications/:applicationId` to file        | Filing is "make this membership exist" — idempotent by nature — so `PUT`, not `POST`                     |
| Another poster gets `404`; a non-poster gets `403` | Same split as every other casting write                                                                  |
| An application from a different role is `404`      | Checked explicitly; the database would otherwise happily link it                                         |
| Folders keep working after a role closes           | Final selection usually happens after the call has closed                                                |

**Privacy.** The applicant list carries the same public facts as a public
profile card — name, profession, location, photo, profile link — and never
email, phone or user id. Contact is the messaging work of WBS 1.4.

## Media storage on Cloudinary (Week 10)

At the client's request every upload — profile photo, CV, portfolio photos and
reels (WBS 1.1.2.2, 1.1.2.3) — goes to Cloudinary (cloud `duinyfucs`, folder
`abhinay`). Files are never stored in the database; rows hold the provider, the
provider's key and the delivery URL.

**Flow** (the client's specification, made precise):

1. multer streams the file to `STORAGE_ROOT/tmp-uploads/<uuid>.upload` under a
   size cap. "Local memory" was implemented as a local temporary **file**, not
   RAM: a 100 MB reel held in memory per request would be a denial-of-service
   risk, and `sharp` and the Cloudinary SDK both read from a path.
2. The service validates it: images are decoded and re-encoded by `sharp`; PDFs
   and videos are identified by their signature.
3. The file is uploaded to Cloudinary (`upload` for images and PDFs,
   chunked `upload_large` for videos).
4. Only after that succeeds is the link written, inside a transaction that
   locks the profile row.
5. The temporary file is deleted — by the service before it answers, and again
   by the upload middleware when the response ends or the connection drops. A
   sweep on startup and hourly removes anything a crash left behind.

**Edge cases and what happens.**

| Situation                                            | Result                                                                                                                     |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Credentials blank (development)                      | API starts with a warning; uploads answer `503 MEDIA_STORAGE_UNAVAILABLE`                                                  |
| Credentials blank (production)                       | Startup fails — a server that cannot store uploads should not run                                                          |
| Not signed in                                        | `401` before multer runs, so nothing touches the disk                                                                      |
| Over the size cap                                    | `413`, cut off while streaming                                                                                             |
| Disallowed declared type / wrong field / two files   | `400`                                                                                                                      |
| Renamed, truncated or disguised file                 | `415` (decode or signature check)                                                                                          |
| HEIC/AVIF photo sent as a video                      | `415` — same container as MP4, so the brand is checked, not just the box                                                   |
| Cloudinary rejects, times out or is unreachable      | `502 MEDIA_UPLOAD_FAILED`; no row written; the reason is logged without credentials                                        |
| Database write fails after upload                    | The uploaded copy is deleted; the previous file and reference are untouched                                                |
| Reel longer than 3 minutes (known only after upload) | Deleted from Cloudinary again; `422`                                                                                       |
| Portfolio already full                               | `422` before uploading; re-checked under the lock, the loser's upload deleted                                              |
| Two concurrent replacements of a photo or CV         | Serialized by the row lock; each deletes exactly the file it replaced; no orphans                                          |
| Deleting the replaced file fails                     | The request still succeeds; the orphan is logged (an orphan is harmless, a broken link is not)                             |
| Client aborts mid-upload                             | multer discards the partial file; the middleware deletes it again                                                          |
| Process crashes mid-request                          | The temporary file is swept within the hour                                                                                |
| Photos uploaded before Cloudinary                    | Migration backfills `profile_image_provider = LOCAL`; they keep resolving and are deleted from local storage when replaced |

**Placement.** `public_id` is a generated UUID under `abhinay/<kind>/`
(`profile-photos`, `resumes`, `portfolio-photos`, `reels`), set with both
`folder` and `asset_folder` so it lands in the right media-library folder in
both fixed- and dynamic-folder accounts. PDFs are `raw` uploads with `.pdf` in
the id, so the delivery URL ends in `.pdf` and is not subject to Cloudinary's
image-delivery restrictions on PDFs. `overwrite: false`. Deletion uses
`invalidate: true` to purge CDN copies.

**Testing.** The suites run with `MEDIA_STORAGE=local`, a filesystem driver
behind the same interface, so they need no network and no account. The
Cloudinary driver is unit-tested with the SDK mocked (folders, resource types,
chunking, error mapping, secret never logged). Failure paths in the service are
exercised by spying on the driver.

**Privacy.** A CV is public on the profile; the upload form says so. Cloudinary
delivery URLs are unguessable but unauthenticated; signed, expiring URLs are the
upgrade path if CVs ever need to be private.

## Instagram reel links and demo data (Week 10)

**Reel links.** An Instagram reel URL is a web page, not a video file, so it
cannot play in the portfolio's `<video>` player. At the client's choice it is a
**link card** that opens Instagram in a new tab — not an embedded player, which
would load Instagram's script and tracking on every profile view.

| Choice                                             | Rationale                                                                                      |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| New `PortfolioMediaKind.LINK`, provider `EXTERNAL` | The existing item model fits; `EXTERNAL` tells deletion there is nothing of ours to remove     |
| Strict host and path allowlist, canonical URL      | The URL becomes an `href`: no `javascript:`, no look-alike host, no tracking parameters stored |
| Duplicates `409`, ≤ 6 links, counted separately    | Same row-lock pattern as photos and reels                                                      |
| No media storage needed                            | Nothing is uploaded, so links work even when Cloudinary is unavailable                         |

**Demo seed.** `prisma/seed-demo.ts` (`npm run db:seed:demo`) fills a
development database for manual testing.

- **Images** are Unsplash URLs, linked directly as `EXTERNAL` (the client chose
  this over uploading copies to Cloudinary). Every photo id was checked to
  return 200, and each was looked at so portraits go to avatars and film
  imagery to portfolios.
- **Reels** are real public reels found through news articles that embed them,
  each verified live on 2026-10-09 by reading the owner from the reel page. A
  reel from an account that appeared to belong to a child, and one featuring
  that child, were deliberately left out. Every reel is captioned "Sample reel —
  @owner", so the card never presents someone's work as the fictional member's.
  Links can go stale; the seed does not re-check them at run time.
- **Safety.** It refuses `NODE_ENV=production`, writes only accounts at
  `@demo.abhinay.test`, does nothing if they already exist, and `--fresh`
  deletes only those accounts (first removing any files they uploaded through
  the app, so Cloudinary is not left with orphans).
- **Realism.** Applications are created only where the real rules allow them
  (matching profession, never the author, after publishing and before closing),
  and `tests/integration/seed-demo.test.ts` asserts it, so the demo can never
  show a state the API could not produce.

## Theme completion (Week 9)

The in-progress shadcn theme (tweakcn tokens, Inter / Source Serif 4 / JetBrains
Mono) had dropped the `brand-*` palette that 32 utilities in 12 existing files
use, plus `.gradient-text`, `.animate-pulse-glow`, `--font-heading` and the
`tw-animate-css` / `shadcn/tailwind.css` imports. At the client's direction the
old brand colours were **moved onto the new theme** rather than restored:

- `brand-*` is now a scale on the theme primary's hue (259.77 in oklch), with
  lightness stepped like a Tailwind palette and chroma kept as muted as the
  theme. `brand-600`, the colour of every primary call to action, is
  `var(--primary)` itself, so those buttons always match the shadcn `<Button>`.
- `.gradient-text` draws from the same scale; the status pulse stays green and
  now stops for users who prefer reduced motion.
- The two imports are back, so `select.tsx`'s `animate-in` and `data-open`
  utilities resolve again.

The theme's own `--font-sans: Inter, sans-serif` declarations were checked in a
browser and left alone: `next/font`'s variable wins, and the self-hosted Inter
is the face actually rendered.

## Password policy change (Week 9)

The minimum password length was lowered from 12 to **6 characters** at the
client's request. The 72-byte maximum is unchanged (bcrypt's truncation
point), and passwords are still never trimmed or case-folded. Existing accounts
are unaffected: login only ever required a non-empty password.

Trade-off, recorded deliberately: NIST SP 800-63B recommends at least 8
characters. Bcrypt's cost and the per-IP throttle on `/auth/login` blunt online
guessing, but short passwords remain weaker against an offline attack on a
leaked hash. Raising the floor again is one constant on each side —
`MIN_PASSWORD_LENGTH` in `apps/backend/src/utils/password.ts` and
`LIMITS.PASSWORD_MIN` in `apps/frontend/src/lib/validation.ts` — plus the seed
check in `apps/backend/prisma/seed.ts`.

## Repository hygiene (Week 9)

- `.env.example` and `.env.test.example` existed only in the documentation;
  they are now committed, secret-free, and cover every variable `env.ts` reads.
- The shadcn UI primitives (added at the end of Week 5) were never run through
  Prettier, so `npm run format:check` and therefore `npm run verify` failed.
  They are now formatted; behaviour is unchanged.
- `next` moved from 16.3.2 to 16.3.8 (a critical advisory, same minor line),
  with `eslint-config-next` kept in lockstep. Both stay pinned exactly.
- The Postman test scripts declared a top-level `const data`, which collides
  with the Postman sandbox's built-in `data` global, so Register, Login and
  Refresh never stored a token. Renamed to `payload`. The collection has now
  been run end to end with newman.

## Known gaps

- Refresh-token rows are not garbage-collected; revoked and expired rows
  accumulate. A periodic cleanup belongs with the deployment work, which is out
  of scope.
- `AUTH_RATE_LIMIT_*` is in-process, so it resets on restart and is per-instance.
  A shared store was explicitly ruled out for a local stack.
- Reel duration is only checked by Cloudinary. In `MEDIA_STORAGE=local` (tests,
  offline work) there is no duration limit.
- A file whose deletion fails after a replacement stays in Cloudinary as an
  orphan; there is no reconciliation job.
- Role is fixed at registration. No endpoint changes it, by design.
- "Concurrent use of one refresh token yields at most one success" is
  timing-dependent: a request that reads the token just after another request's
  rotation commits qualifies for the 10-second interrupted-rotation recovery and
  also succeeds. The integration test for it fails intermittently (once in nine
  runs on 2026-10-05); see `week-6-9-status.md`.
