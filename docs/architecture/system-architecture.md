# System Architecture

Scope: WBS 1.1 — accounts, authentication, professional profiles and their
media (photo, CV, portfolio photos, reels) — and WBS 1.2 — casting role posting,
browse, search, apply and shortlist folders.

## Shape of the system

```
┌──────────────────────────────────────────────────────────────┐
│ Browser                                                      │
│   access token in memory · refreshToken HttpOnly cookie      │
└───────────────┬──────────────────────────────┬───────────────┘
                │ fetch (credentials: include) │ <img>/<video>/CV link
                ▼                              ▼
┌───────────────────────────────┐   ┌──────────────────────────┐
│ Next.js (App Router)          │   │ Cloudinary CDN           │
│ http://localhost:3000         │   │ abhinay/<kind>/…         │
│ pages · components · hooks    │   │ (or Express /media/… in  │
│ lib/api.ts (the only caller)  │   │  local mode and tests)   │
└───────────────┬───────────────┘   └──────────────────────────┘
                │ REST /api/v1 (JSON, multipart, cookies)  ▲
                ▼                                          │ signed upload
┌──────────────────────────────────────────────────────────┴───┐
│ Express API — http://localhost:5000/api/v1                   │
│                                                              │
│  helmet → cors → json(32 KiB) → cookies → logging            │
│  routes → [rate limit] [origin] [authenticate] [requireRole] │
│         → [multer → STORAGE_ROOT/tmp-uploads]                │
│         → controllers (thin) → services (logic) → Prisma     │
│  notFound → centralized error handler                        │
└───────────────┬──────────────────────────────────────────────┘
                │
                ▼
     ┌──────────────────────────────────────────────┐
     │ PostgreSQL — rows and media LINKS, no bytes  │
     │ users · profiles · portfolio_items · skills  │
     │ experiences · refresh_tokens · casting_roles │
     │ applications · shortlist_folders/_entries    │
     └──────────────────────────────────────────────┘
```

Next.js never talks to PostgreSQL and the backend never renders HTML. Media is
fetched straight from Cloudinary (or, in local mode, from the Express origin) —
never proxied through Next.js and never under `/api`.

## Technology

| Layer    | Technology                                                                  |
| -------- | --------------------------------------------------------------------------- |
| Frontend | Next.js (App Router), React, TypeScript, Tailwind CSS, React Hook Form, Zod |
| Backend  | Node.js, Express, TypeScript, Zod, jsonwebtoken, bcrypt, multer, sharp      |
| Media    | Cloudinary (Node SDK v2); local filesystem driver for tests                 |
| Data     | PostgreSQL, Prisma ORM                                                      |
| Tests    | Vitest, Supertest, Playwright                                               |
| Tooling  | npm workspaces, ESLint, Prettier                                            |

## Client/server boundary

`apps/frontend/src/lib/api.ts` is the only module that performs network calls.
It owns the base URL, `credentials: 'include'`, the `Authorization` header,
JSON vs multipart handling, `204` handling, refresh coordination and error
normalisation into `ApiError`. Components never call `fetch` directly, so
session handling cannot drift between pages.

`apps/frontend/src/hooks/useAuth.tsx` holds the session: current user, role,
authenticated flag and a separate initialising flag. Protected UI waits on the
initialising flag, so a reload never flashes the logged-out state before the
refresh-cookie exchange resolves.

`RequireAuth` is a UX guard only. Express independently enforces every
protected read and write, so bypassing the client guard gains nothing.

## Authentication sequence

```
Register / Login
  Client  ── POST /auth/register|login ───────────────▶ Express
                                                         validate (Zod, strict)
                                                         bcrypt hash / compare
                                                         create user + profile (txn)
                                                         persist refresh digest
  Client  ◀── 200/201 { user, accessToken } ───────────
          ◀── Set-Cookie: refreshToken (HttpOnly, /api/v1/auth)

Authenticated request
  Client  ── Authorization: Bearer <access> ──────────▶ authenticate
                                                         verify sig, alg, exp, typ
                                                         load current role from DB
                                                       ▶ requireRole (if any)
                                                       ▶ controller → service → Prisma

Reload / expiry
  Client  ── POST /auth/refresh (cookie + X-Abhinay-Client) ─▶ rotate
                                                         verify, match digest
                                                         consume old + persist new (txn)
  Client  ◀── 200 { user, accessToken } + new cookie ──
          ── GET /auth/me ────────────────────────────▶ current user

Logout
  Client  ── POST /auth/logout (cookie + header) ─────▶ revoke refresh row
  Client  ◀── 200, cookie cleared ─────────────────────
```

Access tokens already issued stay valid until they expire; logout ends the
refresh session, not every outstanding access token.

### Token strategy

| Token   | Storage                              | Lifetime | Purpose                  |
| ------- | ------------------------------------ | -------- | ------------------------ |
| Access  | Browser memory (module closure)      | 15 min   | Authorize API requests   |
| Refresh | HttpOnly cookie, `Path=/api/v1/auth` | 7 days   | Obtain new access tokens |

Refresh tokens are JWTs, but only their SHA-256 digest is stored. Rotation is
single-use and enforced by a conditional `UPDATE`, with a documented 10-second
recovery window for a rotation whose response never reached the client. See
[`../implementation-decisions.md`](../implementation-decisions.md).

## RBAC

```
Request
  │
  ├── authenticate      verify access token → 401 if missing/invalid
  │                     read the CURRENT role from the database
  ├── requireRole(...)  → 403 if the role is not permitted
  └── controller
```

Reading the role from the database rather than the token claim means a role
change takes effect on the next request instead of the next login.
`GET /admin/users` is the demonstration endpoint: read-only, paginated, safe
projection, `ADMIN` only.

Casting is the first business use of role policy: `requireRole(PRODUCER,
DIRECTOR)` guards every casting write and `/casting/mine`, while reads need only
`authenticate`. Ownership is a separate, later check inside the service's
conditional writes, so a non-poster gets `403` and another poster gets `404`.

Applying is the one rule that depends on the resource, not just the caller: the
applicant's current role must equal the casting role's `seekingRole`. It cannot
be a route-level `requireRole`, so the service checks it inside the inserting
transaction, under a row lock on the casting role.

## Profile and data relationships

```
User 1───1 Profile ──* ProfileSkill *── Skill        (shared vocabulary)
              ├──────* Experience                     (calendar dates)
              └──────* PortfolioItem                  (photo / reel links)
User ────────* RefreshToken                           (digest only)
User ────────* CastingRole ──* Application *── User  (one per member per role)
                   └──────* ShortlistFolder ──* ShortlistEntry *── Application
```

`User.name` is the single authoritative display name. `Profile` carries bio,
location, phone, and the (provider, key, URL) of its photo and CV. Ownership is enforced inside the
database predicate of every mutation (`where: { id, profileId }`), so
substituting an id in a request cannot reach another user's row even under
concurrency.

Two projections exist: the public one (no email, no phone, no user id, no
timestamps) and the owner one. Both are built by explicit functions in
`services/dto.ts`; Prisma records are never serialized directly.

## Upload path

```
authenticate (401 before a byte is written)
  → multer → STORAGE_ROOT/tmp-uploads/<uuid>.upload   size cap while streaming (413)
  → storage configured?                               503 otherwise
  → validate: images decoded by sharp, PDF/video by signature   415 / 422
  → images re-encoded to WebP                         strips EXIF and payloads
  → upload to Cloudinary (abhinay/<kind>/<uuid>)      502 on any provider failure
  → transaction: lock profile row, write provider + key + URL
        └─ fails → delete the uploaded copy
  → delete the superseded file (best effort, logged)
  → temporary file deleted — on success and on every failure
```

Validation happens before anything is uploaded, and the row is updated before
the old file is deleted, so a failure never leaves a profile pointing at a
missing file. A sweep on startup and hourly removes temporary files a crash
left behind. `MEDIA_STORAGE=local` swaps Cloudinary for a filesystem driver with
the same interface (`apps/backend/src/config/storage.ts`).

## Repository layout

```
abhinay/
├── apps/
│   ├── frontend/            Next.js client
│   │   └── src/{app,components,hooks,lib,services,types,constants}
│   └── backend/             Express API
│       ├── src/{config,controllers,middleware,routes,services,utils,validators,types}
│       ├── prisma/{schema.prisma,migrations,seed.ts}
│       └── tests/{unit,integration}
├── docs/
├── postman/
├── tests/e2e/
├── docker-compose.yml       optional PostgreSQL only
└── package.json             npm workspaces + root scripts
```
