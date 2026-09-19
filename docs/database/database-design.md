# Database Design

PostgreSQL accessed through Prisma. Schema:
`apps/backend/prisma/schema.prisma`. Migrations:
`apps/backend/prisma/migrations/`.

Scope is WBS 1.1 (accounts and professional profiles). There are no casting,
application, messaging or project tables, and none are planned in this phase.

## Conventions

- Models are PascalCase and map to snake_case plural tables via `@@map`;
  columns map via `@map`.
- Primary keys are opaque UUID strings, so ids are neither enumerable nor
  meaningful.
- `createdAt` is set on insert; `updatedAt` is maintained by Prisma on write.
- Every child row cascades from its parent, so deleting a user removes their
  profile, skill links, experiences and refresh tokens and leaves nothing
  dangling.

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

| Column                      | Type      | Constraints                               | Notes                                                   |
| --------------------------- | --------- | ----------------------------------------- | ------------------------------------------------------- |
| `id`                        | TEXT      | PK                                        | The id used by `GET /profile/:id`                       |
| `user_id`                   | TEXT      | UNIQUE, FK → `users.id` ON DELETE CASCADE | Exactly one profile per user                            |
| `bio`, `location`, `phone`  | TEXT      | NULL                                      | Optional; empty input is stored as NULL                 |
| `profile_image`             | TEXT      | NULL                                      | Opaque storage key, not a URL and not a client filename |
| `created_at` / `updated_at` | TIMESTAMP | NOT NULL                                  |                                                         |

The profile row is created in the same transaction as the user, so a user
without a profile is not a reachable state.

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

## Role enum

`ACTOR`, `DIRECTOR`, `PRODUCER`, `CAMERA_OPERATOR`, `EDITOR`, `OTHER_CREW`,
`ADMIN`. Only the first six are selectable at registration.

## Relationships

```
users 1───1 profiles 1───* profile_skills *───1 skills
  │              │
  │              └───* experiences
  └───* refresh_tokens
```

## Migrations

```
prisma/migrations/
├── <initial>/                       users table + Role enum
└── 20260919094048_profiles_skills_experience_refresh_tokens/
```

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
