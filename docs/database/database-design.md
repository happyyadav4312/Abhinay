# Database Design

## Overview

Abhinay uses **PostgreSQL** as the primary relational database, accessed through **Prisma ORM** for type-safe queries and schema management.

## Current Schema (Week 1)

### User Table

The `users` table serves as the foundation for authentication and is designed to be referenced by all future domain tables (profiles, projects, castings, applications, etc.).

| Column          | Type        | Constraints                  | Description                    |
|-----------------|-------------|------------------------------|--------------------------------|
| `id`            | UUID        | Primary Key, auto-generated  | Unique user identifier         |
| `email`         | VARCHAR     | Unique, NOT NULL             | User's email address           |
| `password_hash` | VARCHAR     | NOT NULL                     | bcrypt-hashed password         |
| `role`          | Role (enum) | NOT NULL, default: `ACTOR`   | User's primary platform role   |
| `created_at`    | TIMESTAMP   | NOT NULL, auto-set           | Account creation timestamp     |
| `updated_at`    | TIMESTAMP   | NOT NULL, auto-updated       | Last modification timestamp    |

### Role Enum

| Value            | Description                            |
|------------------|----------------------------------------|
| `ACTOR`          | Talent seeking roles                   |
| `DIRECTOR`       | Film/scene director                    |
| `PRODUCER`       | Production management                  |
| `CAMERA_OPERATOR`| Camera/cinematography                  |
| `EDITOR`         | Post-production editing                |
| `OTHER_CREW`     | Other crew members                     |
| `ADMIN`          | Platform administrator                 |

### Entity Relationship Diagram

```
┌─────────────────────────────────┐
│            users                │
├─────────────────────────────────┤
│ id           UUID    PK         │
│ email        VARCHAR UNIQUE     │
│ password_hash VARCHAR           │
│ role         Role    ENUM       │
│ created_at   TIMESTAMP          │
│ updated_at   TIMESTAMP          │
├─────────────────────────────────┤
│ Indexes:                        │
│  - UNIQUE(email)                │
└──────────────┬──────────────────┘
               │
               │ Future Relations (Weeks 2–10):
               │
    ┌──────────┼──────────────────────────────┐
    │          │          │         │          │
    ▼          ▼          ▼         ▼          ▼
 profiles   projects  castings  applications  messages
```

## Prisma Configuration

### Schema Location

```
apps/api/prisma/schema.prisma
```

### Key Design Decisions

1. **UUID for `id`**: Avoids sequential integer enumeration and is safe for distributed systems.
2. **`@map` annotations**: Prisma field names use camelCase (`passwordHash`), but the database columns use snake_case (`password_hash`) via `@map`.
3. **`@@map("users")`**: The Prisma model is named `User` but maps to the `users` table in PostgreSQL.
4. **Timestamps**: `createdAt` is auto-set on creation; `updatedAt` is auto-updated by Prisma on every write.

## Migrations

Migrations are stored in:

```
apps/api/prisma/migrations/
```

### Running Migrations

```bash
# From apps/api/
npx prisma migrate dev --name <migration-name>

# Or from root
npm run db:migrate
```

### Generating Client

After any schema change:

```bash
npx prisma generate
```

## Seed Data

The seed script (`prisma/seed.ts`) creates a development admin user:

| Field    | Value               |
|----------|---------------------|
| Email    | `admin@abhinay.dev` |
| Password | `Admin@123`         |
| Role     | `ADMIN`             |

> ⚠️ This seed data is for **development only**. Never use these credentials in production.

## Future Schema Expansion

The `User` model is designed as the central reference point. Future tables will include:

- **Profile**: Extended user information (bio, skills, portfolio)
- **Project**: Film/production projects
- **CastingRole**: Roles within projects open for casting
- **Application**: Actor applications to casting roles
- **Message**: In-platform messaging between users
- **Audition**: Audition scheduling and self-tape submissions
- **Notification**: Platform notifications

All future tables will reference `users.id` as a foreign key.
