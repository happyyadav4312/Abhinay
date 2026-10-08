# Database Design

PostgreSQL accessed through Prisma. Schema:
`apps/backend/prisma/schema.prisma`. Migrations:
`apps/backend/prisma/migrations/`.

Scope is WBS 1.1 (accounts, professional profiles and their media) and WBS 1.2
(casting role posting, discovery, applications and shortlist folders). There
are no messaging or project tables yet; each arrives with its own work package.

Uploaded files are **never** stored in the database. Each stored file is a
(provider, key, URL) triple: where it lives (`CLOUDINARY` or `LOCAL`), the
provider's identifier, and the delivery URL.

## Conventions

- Models are PascalCase and map to snake_case plural tables via `@@map`;
  columns map via `@map`.
- Primary keys are opaque UUID strings, so ids are neither enumerable nor
  meaningful.
- `createdAt` is set on insert; `updatedAt` is maintained by Prisma on write.
- Every child row cascades from its parent, so deleting a user removes their
  profile, skill links, experiences, refresh tokens, casting roles and
  applications and leaves nothing dangling.

## Tables

### users

| Column                      | Type      | Constraints               | Notes                                                                   |
| --------------------------- | --------- | ------------------------- | ----------------------------------------------------------------------- |
| `id`                        | TEXT      | PK                        | UUID                                                                    |
| `name`                      | TEXT      | NOT NULL                  | The single authoritative display name; `profiles` does not duplicate it |
| `email`                     | TEXT      | UNIQUE, NOT NULL          | Stored already trimmed and lowercased                                   |
| `password_hash`             | TEXT      | NOT NULL                  | bcrypt                                                                  |
| `role`                      | Role      | NOT NULL, default `ACTOR` |                                                                         |
| `created_at` / `updated_at` | TIMESTAMP | NOT NULL                  |                                                                         |

The unique index on `email` is the real arbiter of account uniqueness: two
simultaneous registrations both pass the application-level check, and the loser
surfaces as a Prisma `P2002`, which the service translates into a clean `409`.

### profiles

| Column                                        | Type                        | Constraints                               | Notes                                                  |
| --------------------------------------------- | --------------------------- | ----------------------------------------- | ------------------------------------------------------ |
| `id`                                          | TEXT                        | PK                                        | The id used by `GET /profile/:id`                      |
| `user_id`                                     | TEXT                        | UNIQUE, FK → `users.id` ON DELETE CASCADE | Exactly one profile per user                           |
| `bio`, `location`, `phone`                    | TEXT                        | NULL                                      | Optional; empty input is stored as NULL                |
| `profile_image`                               | TEXT                        | NULL                                      | Photo's storage key, never a client filename           |
| `profile_image_url`                           | TEXT                        | NULL                                      | Delivery URL; NULL for photos stored before Week 10    |
| `profile_image_provider`                      | StorageProvider             | NULL                                      | Backfilled to `LOCAL` for photos stored before Week 10 |
| `resume_key`, `resume_url`, `resume_provider` | TEXT, TEXT, StorageProvider | NULL                                      | The CV (a PDF) — key, delivery URL, provider           |
| `resume_file_name`                            | TEXT                        | NULL                                      | Sanitised display name only                            |
| `resume_bytes`                                | INTEGER                     | NULL                                      |                                                        |
| `resume_uploaded_at`                          | TIMESTAMP                   | NULL                                      |                                                        |
| `created_at` / `updated_at`                   | TIMESTAMP                   | NOT NULL                                  |                                                        |

The profile row is created in the same transaction as the user, so a user
without a profile is not a reachable state. Replacing a photo or CV locks this
row (`SELECT … FOR UPDATE`), so concurrent replacements are applied in turn and
each deletes exactly the file it replaced.

### portfolio_items

A portfolio photo or show reel (WBS 1.1.2.3). The row is written only after the
file has been uploaded.

| Column             | Type               | Constraints                          | Notes                               |
| ------------------ | ------------------ | ------------------------------------ | ----------------------------------- |
| `id`               | TEXT               | PK                                   | UUID                                |
| `profile_id`       | TEXT               | FK → `profiles.id` ON DELETE CASCADE |                                     |
| `kind`             | PortfolioMediaKind | NOT NULL                             | `PHOTO` or `VIDEO`                  |
| `provider`         | StorageProvider    | NOT NULL                             |                                     |
| `storage_key`      | TEXT               | NOT NULL                             | Never returned by the API           |
| `url`              | TEXT               | NOT NULL                             | Delivery URL                        |
| `thumbnail_url`    | TEXT               | NULL                                 | Still frame for a reel (Cloudinary) |
| `title`            | TEXT               | NULL                                 | ≤ 100 characters                    |
| `bytes`            | INTEGER            | NOT NULL                             |                                     |
| `width`, `height`  | INTEGER            | NULL                                 |                                     |
| `duration_seconds` | DOUBLE PRECISION   | NULL                                 | Reels; reported by Cloudinary       |
| `created_at`       | TIMESTAMP          | NOT NULL                             |                                     |

`INDEX(profile_id, kind, created_at)` serves the per-kind count (≤ 12 photos,
≤ 4 reels, checked under the profile row lock) and the display order.

### skills

| Column            | Type      | Constraints      | Notes                                     |
| ----------------- | --------- | ---------------- | ----------------------------------------- |
| `id`              | TEXT      | PK               |                                           |
| `name`            | TEXT      | NOT NULL         | First-seen display casing                 |
| `normalized_name` | TEXT      | UNIQUE, NOT NULL | Trimmed, whitespace-collapsed, lowercased |
| `created_at`      | TIMESTAMP | NOT NULL         |                                           |

Shared vocabulary across profiles. Removing a skill from a profile never
deletes the row here.

### profile_skills

| Column       | Type      | Constraints                                          |
| ------------ | --------- | ---------------------------------------------------- |
| `id`         | TEXT      | PK — the handle used by `DELETE /profile/skills/:id` |
| `profile_id` | TEXT      | FK → `profiles.id` ON DELETE CASCADE                 |
| `skill_id`   | TEXT      | FK → `skills.id` ON DELETE CASCADE                   |
| `created_at` | TIMESTAMP | NOT NULL                                             |

`UNIQUE(profile_id, skill_id)` makes a duplicate link impossible even under
concurrent requests. `INDEX(skill_id)` supports the reverse lookup.

### experiences

| Column                      | Type      | Constraints                                   | Notes                                                              |
| --------------------------- | --------- | --------------------------------------------- | ------------------------------------------------------------------ |
| `id`                        | TEXT      | PK                                            |                                                                    |
| `profile_id`                | TEXT      | FK → `profiles.id` ON DELETE CASCADE, indexed | Part of every mutation predicate, which is what enforces ownership |
| `title`, `organization`     | TEXT      | NOT NULL                                      |                                                                    |
| `description`               | TEXT      | NULL                                          |                                                                    |
| `start_date`                | DATE      | NOT NULL                                      | `date`, not `timestamp`, so no timezone can shift the day          |
| `end_date`                  | DATE      | NULL                                          | NULL means ongoing                                                 |
| `created_at` / `updated_at` | TIMESTAMP | NOT NULL                                      |                                                                    |

### refresh_tokens

| Column           | Type      | Constraints                                | Notes                                                      |
| ---------------- | --------- | ------------------------------------------ | ---------------------------------------------------------- |
| `id`             | TEXT      | PK                                         | The JWT `jti`                                              |
| `user_id`        | TEXT      | FK → `users.id` ON DELETE CASCADE, indexed |                                                            |
| `token_hash`     | TEXT      | UNIQUE, NOT NULL                           | SHA-256 of the raw token; the token itself is never stored |
| `expires_at`     | TIMESTAMP | NOT NULL, indexed                          |                                                            |
| `revoked_at`     | TIMESTAMP | NULL                                       | Set when consumed by rotation or logout                    |
| `replaced_by_id` | TEXT      | NULL                                       | The row that superseded this one                           |
| `created_at`     | TIMESTAMP | NOT NULL                                   |                                                            |

Rotation consumes a row with a conditional write
(`UPDATE … WHERE id = $1 AND revoked_at IS NULL`). PostgreSQL serialises the
two writes, so two simultaneous uses of one token cannot both succeed.

### casting_roles

A casting call posted by a producer or director (WBS 1.2.1).

| Column                      | Type              | Constraints                                | Notes                                                |
| --------------------------- | ----------------- | ------------------------------------------ | ---------------------------------------------------- |
| `id`                        | TEXT              | PK                                         | UUID                                                 |
| `created_by_id`             | TEXT              | FK → `users.id` ON DELETE CASCADE, indexed | The author; part of every mutation predicate         |
| `title`                     | TEXT              | NOT NULL                                   | 3–120 characters                                     |
| `description`               | TEXT              | NOT NULL                                   | ≤ 5000 characters                                    |
| `requirements`              | TEXT              | NOT NULL                                   | ≤ 3000 characters                                    |
| `compensation`              | TEXT              | NOT NULL                                   | Free text, ≤ 200 characters                          |
| `location`                  | TEXT              | NOT NULL                                   | ≤ 120 characters                                     |
| `seeking_role`              | Role              | NOT NULL                                   | The profession sought; the API never accepts `ADMIN` |
| `status`                    | CastingRoleStatus | NOT NULL, default `DRAFT`                  |                                                      |
| `application_deadline`      | DATE              | NULL                                       | Last day to apply, in `APP_TIME_ZONE`; NULL = none   |
| `published_at`              | TIMESTAMP         | NULL                                       | Set on DRAFT → OPEN; the browse ordering             |
| `closed_at`                 | TIMESTAMP         | NULL                                       | Set on OPEN → CLOSED                                 |
| `created_at` / `updated_at` | TIMESTAMP         | NOT NULL                                   |                                                      |

Indexes: `(created_by_id)` for "my postings", `(status, published_at)` for the
newest-first browse list, `(status, seeking_role)` for the role filter, and
`(status, application_deadline)` for hiding expired roles and the deadline sort.

`application_deadline` is a `date`, not a timestamp, for the same reason as
experience dates. An OPEN role past its deadline keeps its status; browse and
apply exclude it by comparing with today's date in the platform zone.

Ownership and the lifecycle are enforced in the write itself, as with
experiences and refresh tokens: an edit is `UPDATE … WHERE id = $1 AND
created_by_id = $2 AND status IN ('DRAFT', 'OPEN')`, a status change requires
the expected source status, and a delete requires `status = 'DRAFT'`. A write
that matches no row is then explained as `404` (not the caller's) or `409`
(wrong status).

Text search is a case-insensitive substring match (`ILIKE`) over title,
description, requirements and location, with `%`, `_` and `\` escaped so user
input is never a wildcard. That is a sequential scan, which is fine at this
scale; a `pg_trgm` index is the upgrade path if the table grows large.

### applications

One member's application to one casting role (WBS 1.2.2.2).

| Column                      | Type              | Constraints                               | Notes                                    |
| --------------------------- | ----------------- | ----------------------------------------- | ---------------------------------------- |
| `id`                        | TEXT              | PK                                        | UUID                                     |
| `casting_role_id`           | TEXT              | FK → `casting_roles.id` ON DELETE CASCADE |                                          |
| `applicant_id`              | TEXT              | FK → `users.id` ON DELETE CASCADE         |                                          |
| `status`                    | ApplicationStatus | NOT NULL, default `APPLIED`               | Moved on by the role's author in WBS 1.3 |
| `created_at` / `updated_at` | TIMESTAMP         | NOT NULL                                  |                                          |

`UNIQUE(casting_role_id, applicant_id)` is the real arbiter of "one application
per member per role": two simultaneous attempts both pass the checks, and the
loser surfaces as Prisma `P2002`, translated into a clean `409`, the same pattern
as duplicate email. The unique index also serves per-role counts.
`INDEX(applicant_id, created_at)` serves "my applications, newest first".

The eligibility rules (role open, not your own, your profession) are checked
inside the inserting transaction after `SELECT … FROM casting_roles WHERE id = $1
FOR SHARE`. That lock makes a concurrent close (an `UPDATE` of the same row) wait
for the insert to commit, so no application is ever written against a role that
had already closed.

Only drafts can be deleted, and a draft can never have applications, so the
cascade from `casting_roles` only fires when a whole account is deleted.
`INDEX(casting_role_id, created_at)` serves the author's applicant list.

### shortlist_folders

A named folder the author of a casting role sorts applicants into (WBS 1.2.3.1).

| Column                      | Type      | Constraints                               | Notes                                     |
| --------------------------- | --------- | ----------------------------------------- | ----------------------------------------- |
| `id`                        | TEXT      | PK                                        | UUID                                      |
| `casting_role_id`           | TEXT      | FK → `casting_roles.id` ON DELETE CASCADE | Ownership follows the role                |
| `name`                      | TEXT      | NOT NULL                                  | Display name, ≤ 60 characters             |
| `normalized_name`           | TEXT      | NOT NULL                                  | Trimmed, whitespace-collapsed, lowercased |
| `created_at` / `updated_at` | TIMESTAMP | NOT NULL                                  |                                           |

`UNIQUE(casting_role_id, normalized_name)` decides duplicate names, even under
concurrent creates (`P2002` → `409`). At most 20 per role, counted while the role
row is locked.

### shortlist_entries

One application filed in one folder (WBS 1.2.3.2).

| Column           | Type      | Constraints                                   |
| ---------------- | --------- | --------------------------------------------- |
| `id`             | TEXT      | PK                                            |
| `folder_id`      | TEXT      | FK → `shortlist_folders.id` ON DELETE CASCADE |
| `application_id` | TEXT      | FK → `applications.id` ON DELETE CASCADE      |
| `created_at`     | TIMESTAMP | NOT NULL                                      |

`UNIQUE(folder_id, application_id)` makes filing idempotent; `INDEX(application_id)`
lists an application's folders. That the application belongs to the folder's
role is checked by the service. Deleting a folder removes its entries and
nothing else; filing never touches `applications.status`.

## Enums

**Role:** `ACTOR`, `DIRECTOR`, `PRODUCER`, `CAMERA_OPERATOR`, `EDITOR`,
`OTHER_CREW`, `ADMIN`. Only the first six are selectable at registration or as
a casting role's `seeking_role`.

**CastingRoleStatus:** `DRAFT` → `OPEN` → `CLOSED`. `CLOSED` is final.

**ApplicationStatus:** `APPLIED`, `SHORTLISTED`, `SELECTED`, `REJECTED` — the four
statuses agreed in Lab 2. Every application starts as `APPLIED`.

**StorageProvider:** `LOCAL`, `CLOUDINARY` — where a stored file lives.

**PortfolioMediaKind:** `PHOTO`, `VIDEO`.

## Relationships

```
users 1───1 profiles 1───* profile_skills *───1 skills
  │              ├───* experiences
  │              └───* portfolio_items
  ├───* refresh_tokens
  ├───* casting_roles 1───* applications 1───* shortlist_entries
  │          └──────* shortlist_folders 1───* shortlist_entries
  └──────────────────────────* applications   (as applicant)
```

## Migrations

```
prisma/migrations/
├── 20260901063302_init/                                     users table + Role enum
├── 20260919094048_profiles_skills_experience_refresh_tokens/
├── 20261005090213_casting_marketplace/                      casting_roles + CastingRoleStatus
├── 20261005095956_applications/                             applications + ApplicationStatus
└── 20261008105134_deadline_shortlists_portfolio_media/      deadline, shortlist tables,
                                                             portfolio_items, CV and photo links
```

The casting and media migrations are purely additive — new enums, new tables,
new nullable columns and their indexes — so they apply cleanly to a populated
database. The Week-10 migration also backfills
`profile_image_provider = 'LOCAL'` for every existing photo, so photos uploaded
before Cloudinary keep resolving and are deleted from the right place.

The second migration adds `users.name` against a table that may already hold
rows, so it runs in four steps: add the column nullable, backfill it from the
email local-part, create a profile for every existing user, then apply
`NOT NULL`. Nothing is dropped and no history is rewritten.

```bash
npm run db:validate        # schema is well formed
npm run db:migrate         # create a reviewed development migration
npm run db:migrate:deploy  # apply committed migrations
npm run db:generate        # regenerate the client after a schema change
```

## Seed

`npm run db:seed` creates a demo `ADMIN` only when both `SEED_ADMIN_EMAIL` and
`SEED_ADMIN_PASSWORD` are set in the environment. There is no hardcoded
password, and the script refuses to run with `NODE_ENV=production`.

## Test database

Integration tests use a separate database whose name must end in `_test`
(configured in `.env.test`). The suite refuses to start otherwise, so its
`TRUNCATE`-based cleanup cannot reach development data.
