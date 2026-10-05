# Abhinay

**Film Production Networking and Casting Platform**

A professional networking platform for film-industry people — actors,
directors, producers, camera operators, editors and other crew.

Delivered so far:

- **WBS 1.1 User Management & Profiles** — accounts and authentication (1.1.1)
  and professional profile management (1.1.2).
- **WBS 1.2 Casting Marketplace, 1.2.1–1.2.2** — producers and directors post
  casting roles (1.2.1); every signed-in member browses and searches the open
  ones and applies to those cast for their own profession (1.2.2).

Shortlists, reviewing applicants, messaging and project features are not
implemented yet; see [`docs/requirements.md`](docs/requirements.md#non-goals).

## Stack

| Layer    | Technology                                                                  |
| -------- | --------------------------------------------------------------------------- |
| Frontend | Next.js (App Router), React, TypeScript, Tailwind CSS, React Hook Form, Zod |
| Backend  | Node.js, Express, TypeScript, JWT, bcrypt, Zod, multer, sharp               |
| Data     | PostgreSQL, Prisma ORM                                                      |
| Tests    | Vitest, Supertest, Playwright                                               |
| Tooling  | npm workspaces, ESLint, Prettier                                            |

Architecture: **Next.js client → Express REST API → Prisma → PostgreSQL**.
Next.js never talks to the database.

## Repository layout

```
abhinay/
├── apps/
│   ├── frontend/         Next.js client (port 3000)
│   │   └── src/{app,components,hooks,lib,services,types,constants}
│   └── backend/          Express API (port 5000)
│       ├── src/{config,controllers,middleware,routes,services,utils,validators,types}
│       ├── prisma/       schema, migrations, seed
│       └── tests/        unit + integration
├── docs/                 requirements, architecture, API, decisions, status
├── postman/              importable collection + secret-free environment
├── tests/e2e/            Playwright browser tests
├── docker-compose.yml    optional PostgreSQL service
└── package.json          workspaces + root scripts
```

## Prerequisites

- **Node.js** ≥ 20 and **npm** ≥ 10
- **PostgreSQL** 14 or newer, running locally (native install or Docker)
- **Git**

Docker is optional — it is only a convenience for PostgreSQL.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create the databases

Native PostgreSQL:

```bash
psql -U postgres -c "CREATE DATABASE abhinay;"
psql -U postgres -c "CREATE DATABASE abhinay_test;"
psql -U postgres -c "CREATE USER abhinay_user WITH PASSWORD 'choose-your-own';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE abhinay TO abhinay_user;"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE abhinay_test TO abhinay_user;"
```

On PostgreSQL 15+, also grant schema rights:

```bash
psql -U postgres -d abhinay      -c "GRANT ALL ON SCHEMA public TO abhinay_user;"
psql -U postgres -d abhinay_test -c "GRANT ALL ON SCHEMA public TO abhinay_user;"
```

Or, with Docker (starts PostgreSQL only — no application containers). It reads
`POSTGRES_*` from `.env`, so set those first, and create the test database
inside the container afterwards:

```bash
docker compose up -d
docker exec -it abhinay-postgres psql -U abhinay_user -d abhinay -c "CREATE DATABASE abhinay_test;"
```

### 3. Configure the environment

```bash
cp .env.example .env               # macOS/Linux
Copy-Item .env.example .env        # Windows PowerShell
```

Then fill in:

- `DATABASE_URL` — your own credentials. Any of `: / ? # [ ] @ %` in the
  password **must** be percent-encoded. Encode it without writing it down:

  ```bash
  node -e "console.log(encodeURIComponent(process.argv[1]))" "your password"
  ```

- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` — two **different** random
  values. Startup fails if they match, are shorter than 32 characters, or look
  like a placeholder:

  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```

Everything else has a working default. The full list, with comments, is in
[`.env.example`](.env.example); configuration is validated at startup by
`apps/backend/src/config/env.ts`.

### 4. Apply migrations

```bash
npm run db:migrate:deploy
npm run db:generate
```

### 5. Optional demo admin

There is no hardcoded admin. `npm run db:seed` creates one only when you supply
both values, and refuses to run with `NODE_ENV=production`:

```bash
SEED_ADMIN_EMAIL=you@example.test SEED_ADMIN_PASSWORD='at least 6 chars' npm run db:seed
```

## Running locally

```bash
npm run dev            # frontend and backend together
npm run dev:frontend   # http://localhost:3000
npm run dev:backend    # http://localhost:5000
```

Health check: <http://localhost:5000/api/v1/health>

## Demo sequence

With both servers running:

1. Open <http://localhost:3000> and **Create account** as, say, an Editor —
   you land on the dashboard.
2. Go to **Profile → Edit profile**. Save a bio, location and phone; add two
   skills; add a credit with a start and end date; upload a JPEG/PNG/WebP photo.
3. Back on **Profile**, click **View public page** and copy the URL.
4. **Log out**, open the copied URL in a private window: the public profile
   renders with no email and no phone.
5. Register a second professional and open the same URL while logged in as
   them: same public view, and their own profile is untouched.
6. Register a **Producer**, choose **Casting → Post a role**, set **Casting
   for** to Actor, fill in the form and **Save as draft**. The draft's page says
   only you can see it; **Publish role** lists it.
7. Log in as any other member, open **Casting**, and search for a word from the
   role's title: it is listed, and opening it shows who posted it. Visiting
   `/casting/create` explains that only producers and directors can post.
8. Register an **Actor**, open the role and **Apply for this role**, then
   confirm. The page shows the application, and **My applications** lists it. A
   member of any other profession sees why they cannot apply instead of a
   button.
9. Back as the producer, the role shows **1 application so far**. **Close
   role**: it disappears from search but stays under **My postings → Closed**,
   and the actor's application stays listed.

## Tests

Unit and integration tests live in `apps/backend/tests`, browser tests in
`tests/e2e`.

### Integration and browser test setup

Both use a **dedicated** database. The suite refuses to start unless
`DATABASE_URL` names a database ending in `_test`, so its cleanup can never
touch development data.

```bash
cp .env.test.example .env.test            # macOS/Linux
Copy-Item .env.test.example .env.test     # Windows PowerShell
```

Fill in `DATABASE_URL` (must end in `_test`) and two more random secrets.

Browsers are downloaded explicitly, never during application startup:

```bash
npm run test:e2e:install                  # Playwright Chromium
```

### Running

```bash
npm run test:unit          # Vitest, no database
npm run test:integration   # Supertest + real PostgreSQL + real migrations
npm run test:e2e           # Playwright against the built stack on ports 3100/5100
npm run verify             # format:check → lint → typecheck → db:validate → build → all tests
```

`npm run test:e2e` builds both apps and starts them on ports 3100/5100 with
`STORAGE_ROOT=storage-e2e`, so a running `npm run dev` is not disturbed.

## All root scripts

| Script                                                | What it does                                   |
| ----------------------------------------------------- | ---------------------------------------------- |
| `npm run dev`                                         | Start frontend and backend                     |
| `npm run build`                                       | Build both workspaces                          |
| `npm run lint`                                        | ESLint across both workspaces                  |
| `npm run typecheck`                                   | `tsc --noEmit` across both workspaces          |
| `npm run format` / `format:check`                     | Prettier write / check                         |
| `npm run db:generate`                                 | Regenerate the Prisma client                   |
| `npm run db:validate`                                 | Validate the Prisma schema                     |
| `npm run db:migrate`                                  | Create a reviewed development migration        |
| `npm run db:migrate:deploy`                           | Apply committed migrations                     |
| `npm run db:seed`                                     | Optional demo admin, from your own credentials |
| `npm run db:studio`                                   | Prisma Studio                                  |
| `npm run test:unit` / `test:integration` / `test:e2e` | Test suites                                    |
| `npm run test:e2e:install`                            | Download the Playwright browser                |
| `npm run verify`                                      | Everything above that gates a change           |

Neither `db:migrate` nor `db:migrate:deploy` resets a database.

## API

Base URL `http://localhost:5000/api/v1`. Full contract:
[`docs/api.md`](docs/api.md).

| Method | Path                        | Access                                                  |
| ------ | --------------------------- | ------------------------------------------------------- |
| GET    | `/health`                   | Public                                                  |
| POST   | `/auth/register`            | Public                                                  |
| POST   | `/auth/login`               | Public                                                  |
| POST   | `/auth/refresh`             | Refresh cookie + `X-Abhinay-Client: web`                |
| POST   | `/auth/logout`              | Refresh cookie + `X-Abhinay-Client: web`                |
| GET    | `/auth/me`                  | Bearer                                                  |
| GET    | `/profile/me`               | Bearer                                                  |
| PUT    | `/profile/me`               | Bearer                                                  |
| GET    | `/profile/:id`              | Public                                                  |
| POST   | `/profile/skills`           | Bearer                                                  |
| DELETE | `/profile/skills/:id`       | Bearer                                                  |
| POST   | `/profile/experience`       | Bearer                                                  |
| PUT    | `/profile/experience/:id`   | Bearer                                                  |
| DELETE | `/profile/experience/:id`   | Bearer                                                  |
| POST   | `/profile/photo`            | Bearer, multipart field `photo`                         |
| DELETE | `/profile/photo`            | Bearer                                                  |
| GET    | `/casting`                  | Bearer — open roles, search and filters                 |
| POST   | `/casting`                  | Bearer, `PRODUCER` or `DIRECTOR`                        |
| GET    | `/casting/mine`             | Bearer, `PRODUCER` or `DIRECTOR`                        |
| GET    | `/casting/:id`              | Bearer — a draft only for its author                    |
| PUT    | `/casting/:id`              | Bearer, author; not once closed                         |
| PATCH  | `/casting/:id/status`       | Bearer, author — publish or close                       |
| DELETE | `/casting/:id`              | Bearer, author; drafts only                             |
| POST   | `/casting/:id/applications` | Bearer — matching profession, not the author, role open |
| GET    | `/applications/mine`        | Bearer                                                  |
| GET    | `/admin/users`              | Bearer, `ADMIN` only                                    |

Example:

```bash
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Nina Rao","email":"nina@example.test","password":"correct horse battery staple","role":"EDITOR"}'
```

### Session model

- The **access token** (15 minutes) is returned in the response body and kept
  in browser memory — never in `localStorage` or `sessionStorage`.
- The **refresh token** (7 days) is an `HttpOnly` cookie scoped to
  `/api/v1/auth`, `SameSite=Lax`, and `Secure` when `NODE_ENV=production`.
  Only its SHA-256 digest is stored server-side.
- Refresh **rotates**: the presented token is consumed and replaced in one
  transaction, and two simultaneous uses succeed at most once.
- **Logout revokes the refresh session and clears the cookie. Access tokens
  already issued stay valid until they expire** (15 minutes by default). There
  is no global access-token revocation in this phase; the integration tests
  assert this actual behaviour.

### Postman

Import [`postman/abhinay.postman_collection.json`](postman/abhinay.postman_collection.json)
and [`postman/abhinay.local.postman_environment.json`](postman/abhinay.local.postman_environment.json),
then set your own `email` and `password` in the environment. No tokens or
credentials are bundled. The collection covers registration, login, refresh,
current user, logout, invalid credentials, duplicate email, invalid tokens,
profile and skill/experience/photo operations, the full casting lifecycle
including applying (its folder registers its own throwaway producer), and both
the non-admin `403` and admin `200` cases.

It can also run headless with newman, without adding it to the project:

```bash
npx newman run postman/abhinay.postman_collection.json \
  -e postman/abhinay.local.postman_environment.json \
  --env-var "email=you+postman@example.test" --env-var "password=at least 6 chars"
```

Use a new email for each run, because `Auth / Register` expects a `201`. Two
requests need manual setup and fail headless by design: **Upload photo** (pick
a file in Postman) and **List users — admin (200)** (paste an admin's token
into `adminAccessToken`).

## Documentation

- [Requirements and non-goals](docs/requirements.md)
- [System architecture](docs/architecture/system-architecture.md)
- [API reference](docs/api.md) · [conventions](docs/api/api-conventions.md)
- [Database design](docs/database/database-design.md)
- [Implementation decisions](docs/implementation-decisions.md)
- [Week 1–5 status](docs/week-1-5-status.md) · [Week 6–9 status](docs/week-6-9-status.md)

## License

UNLICENSED — private project.
