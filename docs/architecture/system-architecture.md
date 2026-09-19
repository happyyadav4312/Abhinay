# System Architecture

Scope: WBS 1.1 — accounts, authentication and professional profiles.

## Shape of the system

```
┌──────────────────────────────────────────────────────────────┐
│ Browser                                                      │
│   access token in memory · refreshToken HttpOnly cookie      │
└───────────────┬──────────────────────────────┬───────────────┘
                │ fetch (credentials: include) │ <img src=…>
                ▼                              ▼
┌───────────────────────────────┐   ┌──────────────────────────┐
│ Next.js (App Router)          │   │ Express static media     │
│ http://localhost:3000         │   │ /media/profile-photos    │
│ pages · components · hooks    │   └──────────────────────────┘
│ lib/api.ts (the only caller)  │
└───────────────┬───────────────┘
                │ REST /api/v1 (JSON, cookies)
                ▼
┌──────────────────────────────────────────────────────────────┐
│ Express API — http://localhost:5000/api/v1                   │
│                                                              │
│  helmet → cors → json(32 KiB) → cookies → logging            │
│  routes → [rate limit] [origin] [authenticate] [requireRole] │
│         → controllers (thin) → services (logic) → Prisma     │
│  notFound → centralized error handler                        │
└───────────────┬──────────────────────────────┬───────────────┘
                │                              │
                ▼                              ▼
     ┌─────────────────────┐        ┌────────────────────────┐
     │ PostgreSQL          │        │ Filesystem storage     │
     │ users · profiles    │        │ STORAGE_ROOT/          │
     │ skills · experiences│        │   profile-photos/      │
     │ refresh_tokens      │        │ (ProfilePhotoStorage)  │
     └─────────────────────┘        └────────────────────────┘
```

Next.js never talks to PostgreSQL and the backend never renders HTML. Profile
images are fetched straight from the Express origin, not proxied through
Next.js and not under `/api`.

## Technology

| Layer    | Technology                                                                  |
| -------- | --------------------------------------------------------------------------- |
| Frontend | Next.js (App Router), React, TypeScript, Tailwind CSS, React Hook Form, Zod |
| Backend  | Node.js, Express, TypeScript, Zod, jsonwebtoken, bcrypt, multer, sharp      |
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

## Profile and data relationships

```
User 1───1 Profile ──* ProfileSkill *── Skill        (shared vocabulary)
              └──────* Experience                     (calendar dates)
User ────────* RefreshToken                           (digest only)
```

`User.name` is the single authoritative display name. `Profile` carries bio,
location, phone and the opaque photo key. Ownership is enforced inside the
database predicate of every mutation (`where: { id, profileId }`), so
substituting an id in a request cannot reach another user's row even under
concurrency.

Two projections exist: the public one (no email, no phone, no user id, no
timestamps) and the owner one. Both are built by explicit functions in
`services/dto.ts`; Prisma records are never serialized directly.

## Upload path

```
multipart (memory) → size/MIME early reject (multer)
                   → decode & validate (sharp)     ─ 415/413 on failure
                   → re-encode 512×512 WebP        ─ strips EXIF and payloads
                   → write with a generated UUID name
                   → update profiles.profile_image
                   → delete the superseded file
```

Validation happens before anything is written, and the row is updated before
the old file is deleted, so a failure never leaves a profile pointing at a
missing image.

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
