# API Reference

Complete contract for the Express API. Conventions that apply to every endpoint
(envelope shape, status-code meanings, naming) are in
[`api/api-conventions.md`](api/api-conventions.md); this document is the
per-endpoint specification.

- Base URL: `http://localhost:5000/api/v1`
- Content type: `application/json`, except the multipart photo upload.
- All identifiers are opaque UUID strings.

## Envelope

Success:

```json
{ "success": true, "message": "Login successful", "data": { "...": "..." } }
```

Failure:

```json
{
  "success": false,
  "message": "Validation failed",
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Validation failed",
    "fieldErrors": { "email": ["Enter a valid email address"] }
  }
}
```

`error.code` is the stable, machine-readable value; `error.message` is for
humans and may be reworded. `fieldErrors` is present only when the failure maps
onto specific input fields. A `204` response has no body at all.

### Error codes

`VALIDATION_FAILED` (422), `BAD_REQUEST` (400), `INVALID_CREDENTIALS` (401),
`UNAUTHENTICATED` (401), `INVALID_TOKEN` (401), `FORBIDDEN` (403),
`FORBIDDEN_ORIGIN` (403), `MISSING_CLIENT_HEADER` (403), `NOT_ELIGIBLE` (403),
`NOT_FOUND` (404), `EMAIL_TAKEN` (409), `INVALID_STATUS_TRANSITION` (409),
`CASTING_ROLE_CLOSED` (409), `CASTING_ROLE_NOT_DRAFT` (409), `CASTING_ROLE_NOT_OPEN` (409),
`ALREADY_APPLIED` (409), `PAYLOAD_TOO_LARGE` (413), `UNSUPPORTED_MEDIA_TYPE` (415),
`TOO_MANY_REQUESTS` (429), `LIMIT_EXCEEDED` (422), `INTERNAL_ERROR` (500),
`SERVICE_UNAVAILABLE` (503).

## Authentication

| Mechanism     | Where                                                                                                          | Used by                                   |
| ------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Access token  | `Authorization: Bearer <token>`, 15 minutes by default                                                         | Every protected endpoint                  |
| Refresh token | `refreshToken` HttpOnly cookie, `Path=/api/v1/auth`, `SameSite=Lax`, `Secure` in production, 7 days by default | `POST /auth/refresh`, `POST /auth/logout` |

The access token is held in browser memory only. The refresh cookie is the only
thing that survives a reload.

### Required client header

`POST /auth/refresh` and `POST /auth/logout` are authenticated purely by the
cookie, so they additionally require:

```
X-Abhinay-Client: web
```

It is a non-simple header: a cross-site form post or image tag cannot send it
without a preflight, and the CORS allowlist rejects that preflight from any
origin other than `FRONTEND_URL`. Missing header → `403 MISSING_CLIENT_HEADER`.
Non-browser clients (curl, Postman, tests) simply set it themselves; the
supplied Postman collection has it pre-set at collection level.

### Origin policy

State-changing endpoints reject a request whose `Origin` header is present but
is neither `FRONTEND_URL` nor absent (`403 FORBIDDEN_ORIGIN`). A literal `null`
origin is always rejected. A missing `Origin` means a non-browser client, which
carries no ambient cookies and is therefore not a CSRF vector.

### Throttling

`/auth/register`, `/auth/login` and `/auth/refresh` are limited to
`AUTH_RATE_LIMIT_MAX` requests per `AUTH_RATE_LIMIT_WINDOW_MS` per IP
(defaults: 50 per 15 minutes) and answer `429 TOO_MANY_REQUESTS` beyond that.

## Field limits

| Field                               | Rule                                                                                   |
| ----------------------------------- | -------------------------------------------------------------------------------------- |
| `name`                              | 2–80 characters, trimmed                                                               |
| `email`                             | ≤ 254 characters, trimmed and lowercased before validation, storage and lookup         |
| `password`                          | ≥ 6 characters and ≤ 72 UTF-8 bytes; never trimmed or case-folded                      |
| `bio`                               | ≤ 1000 characters                                                                      |
| `location`                          | ≤ 120 characters                                                                       |
| `phone`                             | ≤ 32 characters, optional, never shown publicly                                        |
| skill `name`                        | 2–40 characters, letters/numbers plus `. , ' & + / # -`; at most 30 skills per profile |
| experience `title` / `organization` | 1–120 characters                                                                       |
| experience `description`            | ≤ 2000 characters; at most 50 entries per profile                                      |
| casting `title`                     | 3–120 characters, trimmed                                                              |
| casting `description`               | 1–5000 characters, trimmed                                                             |
| casting `requirements`              | 1–3000 characters, trimmed                                                             |
| casting `compensation`              | 1–200 characters, trimmed (free text, e.g. "₹15,000 per shooting day")                 |
| casting `location`                  | 1–120 characters, trimmed                                                              |
| casting `seekingRole`               | one of the six public roles; never `ADMIN`                                             |
| casting search `q`                  | ≤ 100 characters; `pageSize` 1–50 (default 20)                                         |
| JSON body                           | 32 KiB; a larger body is rejected with 413                                             |
| photo                               | one JPEG/PNG/WebP file ≤ 5 MiB, ≤ 6000 px per side before processing                   |

Optional text fields accept `null` or `""` to clear them; both are stored as
`NULL` and returned as `null`.

---

# Auth

## POST /auth/register

Public. Creates the user and their profile in one transaction and starts a
session.

Request:

```json
{
  "name": "Nina Rao",
  "email": "nina@example.com",
  "password": "correct horse battery staple",
  "role": "EDITOR"
}
```

`role` must be one of `ACTOR`, `DIRECTOR`, `PRODUCER`, `CAMERA_OPERATOR`,
`EDITOR`, `OTHER_CREW`. `ADMIN` is rejected. Unknown fields are rejected.

`201` with the refresh cookie set:

```json
{
  "success": true,
  "message": "Registration successful",
  "data": {
    "user": {
      "id": "f2b1…",
      "name": "Nina Rao",
      "email": "nina@example.com",
      "role": "EDITOR",
      "createdAt": "2026-09-19T10:00:00.000Z"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIs…"
  }
}
```

Failures: `422 VALIDATION_FAILED`, `409 EMAIL_TAKEN`, `429 TOO_MANY_REQUESTS`,
`403 FORBIDDEN_ORIGIN`.

## POST /auth/login

Public. Same `data` shape as register, `200`, refresh cookie set.

```json
{ "email": "nina@example.com", "password": "correct horse battery staple" }
```

Failures: `422 VALIDATION_FAILED`, `401 INVALID_CREDENTIALS` (identical for an
unknown email and a wrong password), `429`, `403 FORBIDDEN_ORIGIN`.

## POST /auth/refresh

Cookie flow. Requires `X-Abhinay-Client: web`. No request body.

Rotates the session: the presented token is consumed and a new cookie is set in
the same transaction. `200` returns `{ user, accessToken }`, exactly as login.

Failures: `401 UNAUTHENTICATED` (no cookie), `401 INVALID_TOKEN` (expired,
revoked, reused, or not matching its stored digest), `403
MISSING_CLIENT_HEADER`, `429`. Every failure also clears the cookie so the
browser stops replaying a dead session.

Rotation details:

- Two simultaneous uses of the same token result in exactly one `200`; the
  others get `401`.
- If a rotation response never reaches the client (navigation cancelled the
  request, connection dropped), presenting the consumed token again within 10
  seconds succeeds and issues a fresh cookie — provided its replacement has not
  itself been used. Once the replacement has been used, the old token is reuse
  and gets `401`.

## POST /auth/logout

Cookie flow. Requires `X-Abhinay-Client: web`. No request body, no access token
needed, works with an expired access token.

`200 { "data": null }`, cookie cleared with matching attributes. Idempotent: an
absent, malformed, expired or already-revoked cookie also returns `200`.

**This revokes the refresh session only.** Access tokens already issued remain
valid until they expire (15 minutes by default). There is no global access-token
revocation in this phase.

## GET /auth/me

`Authorization: Bearer <access token>`. Returns the safe user projection, with
`role` read from the database rather than from the token claim, so a role change
takes effect immediately.

```json
{ "success": true, "message": "Current user", "data": { "user": { "…": "…" } } }
```

Failures: `401 UNAUTHENTICATED` for a missing, malformed, tampered, expired or
wrong-purpose token. A refresh token presented as an access token is rejected.

---

# Profile

`Profile.id` identifies a profile publicly. `DELETE /profile/skills/:id` takes a
**ProfileSkill.id** (the join row, returned as `skill.id`), not the shared
`Skill.id` (returned as `skill.skillId`). Experience endpoints take an
**Experience.id**.

Literal routes (`/me`, `/skills`, `/experience`, `/photo`) are registered before
`/:id`, so an unauthenticated `GET /profile/me` returns `401` and never falls
through to a public-profile lookup.

## GET /profile/me

Bearer. Owner projection:

```json
{
  "success": true,
  "message": "Profile retrieved",
  "data": {
    "profile": {
      "id": "0f3c…",
      "userId": "f2b1…",
      "name": "Nina Rao",
      "email": "nina@example.com",
      "role": "EDITOR",
      "bio": "Editor working across documentary and long-form drama.",
      "location": "Chennai, India",
      "phone": "+91 90000 11111",
      "photoUrl": "http://localhost:5000/media/profile-photos/9f2c….webp",
      "skills": [{ "id": "b71d…", "skillId": "31aa…", "name": "Avid Media Composer" }],
      "experiences": [
        {
          "id": "77c4…",
          "title": "Lead Editor",
          "organization": "Monsoon Pictures",
          "description": "Feature documentary.",
          "startDate": "2023-04-01",
          "endDate": "2023-11-30"
        }
      ],
      "createdAt": "2026-09-19T10:00:00.000Z",
      "updatedAt": "2026-09-19T10:05:00.000Z"
    }
  }
}
```

Skills are ordered by name, experiences by start date descending with `id` as
the tie-break.

## PUT /profile/me

Bearer. The complete editable scalar representation. `name` is stored on `User`,
the rest on `Profile`; both rows are updated in one transaction.

```json
{ "name": "Nina Rao Verma", "bio": null, "location": "Chennai, India", "phone": null }
```

Returns `200` with the full owner projection. It does **not** touch skills,
experiences, photo, email or role. Any other key — `role`, `email`,
`passwordHash`, `userId`, `id`, `profileImage` — makes the request fail with
`422 VALIDATION_FAILED` rather than being silently ignored.

## GET /profile/:id

Public, no authentication. `:id` is a `Profile.id`.

Returns the public projection: `id`, `name`, `role`, `bio`, `location`,
`photoUrl`, `skills`, `experiences`. **Email, phone, `userId` and timestamps are
absent by design.**

Failures: `404 NOT_FOUND` for an unknown id and, deliberately, for a
syntactically invalid id too — a malformed id is a missing profile, not a
validation error.

## POST /profile/skills

Bearer. Links a skill to the caller's profile, creating the shared skill row on
first use.

```json
{ "name": "Method Acting" }
```

- `201` `{ "skill": { "id", "skillId", "name" } }` when a new link was created.
- `200` with the existing link when the skill is already on the profile —
  adding twice is idempotent, not an error and not a duplicate.

Identity is normalized (trimmed, whitespace-collapsed, lowercased), so
`"Method Acting"`, `"method  acting"` and `" METHOD ACTING "` are the same
skill; the first-seen display casing is preserved.

Failures: `422 VALIDATION_FAILED`, `422 LIMIT_EXCEEDED` past 30 skills, `401`.

## DELETE /profile/skills/:id

Bearer. `:id` is a **ProfileSkill.id**. Returns `204`.

The profile id is part of the delete predicate, so another user's link id
matches nothing and returns `404 NOT_FOUND`. The shared `Skill` row is never
deleted and other profiles keep their links.

## POST /profile/experience

Bearer.

```json
{
  "title": "Lead Editor",
  "organization": "Monsoon Pictures",
  "description": "Feature documentary.",
  "startDate": "2023-04-01",
  "endDate": null
}
```

`201 { "experience": { … } }`. `endDate` may be omitted or `null` for an ongoing
engagement.

Dates are calendar dates in `YYYY-MM-DD`, stored as PostgreSQL `date`, so no
timezone can shift the day. `2025-02-30` is rejected as a non-existent date, and
an `endDate` before `startDate` fails with a `fieldErrors.endDate` message.

Failures: `422 VALIDATION_FAILED`, `422 LIMIT_EXCEEDED` past 50 entries, `401`.

## PUT /profile/experience/:id

Bearer. Same body as create; replaces all fields of the owned entry. `200` with
the updated entry.

Ownership is part of the update predicate, so substituting another user's
experience id returns `404 NOT_FOUND` and changes nothing. A `profileId` or
`userId` in the body is rejected by the strict schema.

## DELETE /profile/experience/:id

Bearer. `204`, or `404` when the entry is not the caller's.

## POST /profile/photo

Bearer. `multipart/form-data` with a single file field named `photo`.

Accepted: JPEG, PNG or WebP, at most 5 MiB and 6000 px per side. The decision is
made by actually decoding the bytes, not by the file extension or the
client-supplied MIME type. Accepted images are re-encoded to a 512×512 WebP,
which also strips EXIF and anything smuggled alongside the pixels.

`200` returns the full owner projection with the new `photoUrl`.

Ordering guarantees: the image is validated and written before the row is
updated, and the superseded file is deleted only after the update succeeds. A
failed upload therefore never blanks out a working photo.

Failures: `400 BAD_REQUEST` (no `photo` field), `413 PAYLOAD_TOO_LARGE`
(too large in bytes or dimensions), `415 UNSUPPORTED_MEDIA_TYPE` (not a
decodable JPEG/PNG/WebP — including SVG, renamed executables and truncated
files), `401`.

## DELETE /profile/photo

Bearer. Clears the reference and removes the stored file. `200` with the owner
projection and `photoUrl: null`. Idempotent when there is no photo.

## Media URLs

Processed photos are served as static files from:

```
GET {PUBLIC_SERVER_URL}/media/profile-photos/<opaque-name>.webp
```

The absolute URL is built from validated configuration, never from the request
`Host` header. Filenames are generated randomly; nothing a client sent is ever
used as a filesystem path, and the path is not under `/api`.

---

# Casting

WBS 1.2.1 (casting role posting) and 1.2.2 (browse, search and apply).
Producers and directors post casting roles; every signed-in user can browse and
read them, and apply when their profession matches. Every casting endpoint
requires `Authorization: Bearer <access token>`. Shortlists and moving an
application's status are later increments.

## Lifecycle

```
DRAFT ──publish──▶ OPEN ──close──▶ CLOSED
```

| Status   | Who can see it                                       | Editable | Deletable     |
| -------- | ---------------------------------------------------- | -------- | ------------- |
| `DRAFT`  | Its author only; anyone else gets `404`              | Yes      | Yes           |
| `OPEN`   | Every signed-in user; listed by `GET /casting`       | Yes      | No — close it |
| `CLOSED` | Every signed-in user with the link; no longer listed | No       | No            |

A closed role is final: it cannot be reopened or edited.

## Who may do what

| Action                             | Actor / crew roles                    | Producer or director (not author)     | Author | Admin |
| ---------------------------------- | ------------------------------------- | ------------------------------------- | ------ | ----- |
| Browse, read `OPEN`/`CLOSED` roles | Yes                                   | Yes                                   | Yes    | Yes   |
| Read a `DRAFT`                     | `404`                                 | `404`                                 | Yes    | `404` |
| Create, list own (`/casting/mine`) | `403`                                 | Yes                                   | Yes    | `403` |
| Edit, publish, close, delete       | `403`                                 | `404`                                 | Yes    | `403` |
| Apply to an `OPEN` role            | If the profession matches, else `403` | If the profession matches, else `403` | `403`  | `403` |

Without a token every endpoint answers `401`. The role check runs before the
ownership check, so a non-poster always gets `403`; a poster touching another
poster's role gets `404`, exactly as for an id that does not exist.

## Casting role object

```json
{
  "id": "6c1e…",
  "title": "Lead — Meera, investigative journalist",
  "seekingRole": "ACTOR",
  "location": "Kochi, Kerala",
  "compensation": "₹15,000 per shooting day",
  "description": "Meera uncovers a coastal land scam while her newspaper is being sold.",
  "requirements": "Female, 25–32. Fluent in Malayalam and English.",
  "status": "OPEN",
  "publishedAt": "2026-10-05T09:30:00.000Z",
  "closedAt": null,
  "createdAt": "2026-10-05T09:12:00.000Z",
  "updatedAt": "2026-10-05T09:30:00.000Z",
  "postedBy": {
    "profileId": "0f3c…",
    "name": "Priya Menon",
    "role": "PRODUCER",
    "photoUrl": null
  },
  "isOwner": false,
  "myApplication": { "id": "9a41…", "status": "APPLIED", "createdAt": "2026-10-05T10:02:00.000Z" },
  "applicationCount": null
}
```

`postedBy` carries the poster's public profile facts only — never their email,
phone or user id. `profileId` links to `GET /profile/:id`. Three fields are
computed for the caller:

- `isOwner` — whether the caller posted the role.
- `myApplication` — the caller's own application to it, or `null`.
- `applicationCount` — how many members have applied, revealed to the **author
  only**; `null` for everyone else. Who applied is not part of this increment.

List endpoints return a **summary** of each role: the same fields without
`description`, `requirements`, `updatedAt`, `isOwner`, `myApplication` and
`applicationCount`, plus a `descriptionPreview` of at most 200 characters
(whitespace collapsed, cut with `…`).

## POST /casting

Bearer, `PRODUCER` or `DIRECTOR`. Always creates a `DRAFT`.

```json
{
  "title": "Lead — Meera, investigative journalist",
  "description": "Meera uncovers a coastal land scam while her newspaper is being sold.",
  "requirements": "Female, 25–32. Fluent in Malayalam and English.",
  "compensation": "₹15,000 per shooting day",
  "location": "Kochi, Kerala",
  "seekingRole": "ACTOR"
}
```

`201 { "castingRole": { … } }`. Every field is required and trimmed.
`seekingRole` is the profession being sought. `status`, `createdById`,
`publishedAt` or any other unknown key fails with `422` rather than being
ignored: status only changes through `PATCH /casting/:id/status`, and ownership
always comes from the token.

Failures: `422 VALIDATION_FAILED`, `403 FORBIDDEN` (any other role, including
`ADMIN`), `403 FORBIDDEN_ORIGIN`, `401`.

## GET /casting

Bearer. Browse `OPEN` roles, newest first (`publishedAt` descending, `id` as the
tie-break).

| Query         | Rule                                                                                    |
| ------------- | --------------------------------------------------------------------------------------- |
| `q`           | ≤ 100 characters. Matches title, description, requirements and location, ignoring case. |
| `seekingRole` | One of the six public roles.                                                            |
| `location`    | ≤ 120 characters. Substring of the location, ignoring case.                             |
| `page`        | ≥ 1, default 1. A page past the end returns an empty list.                              |
| `pageSize`    | 1–50, default 20.                                                                       |

Empty values (`?location=`) mean "no filter". Unknown keys and repeated values
fail with `422`. `%` and `_` in `q` and `location` are matched literally, not as
wildcards.

```json
{
  "success": true,
  "message": "Casting roles retrieved",
  "data": {
    "castingRoles": [{ "id": "6c1e…", "title": "…", "descriptionPreview": "…", "…": "…" }],
    "pagination": { "page": 1, "pageSize": 20, "total": 1, "totalPages": 1 }
  }
}
```

## GET /casting/mine

Bearer, `PRODUCER` or `DIRECTOR`. The caller's own roles in every status, most
recently created first. Query: `status` (`DRAFT`, `OPEN` or `CLOSED`), `page`,
`pageSize`. Same response shape as `GET /casting`.

The literal `/mine` is registered before `/:id`, so a non-poster gets `403`
here, never a `404` from the id route.

## GET /casting/:id

Bearer. `200 { "castingRole": { … } }`.

Failures: `404 NOT_FOUND` for an unknown or malformed id, and for a `DRAFT` the
caller did not write — indistinguishable from an id that was never used, so
drafts cannot be discovered by probing.

## PUT /casting/:id

Bearer, `PRODUCER` or `DIRECTOR`, author only. Same body as create; replaces
every editable field and leaves the status alone. `200` with the updated role.

Failures: `409 CASTING_ROLE_CLOSED`, `404 NOT_FOUND` (unknown, or not yours),
`403 FORBIDDEN`, `422 VALIDATION_FAILED`.

## PATCH /casting/:id/status

Bearer, `PRODUCER` or `DIRECTOR`, author only.

```json
{ "status": "OPEN" }
```

| From     | To       | Result                          |
| -------- | -------- | ------------------------------- |
| `DRAFT`  | `OPEN`   | `200`, stamps `publishedAt`     |
| `OPEN`   | `CLOSED` | `200`, stamps `closedAt`        |
| any      | same     | `200`, no change (idempotent)   |
| `DRAFT`  | `CLOSED` | `409 INVALID_STATUS_TRANSITION` |
| `CLOSED` | `OPEN`   | `409 INVALID_STATUS_TRANSITION` |

`DRAFT` is not a valid target (`422`). The required source status is part of
the database update, so when the same transition is requested concurrently it
happens exactly once and every caller sees the same `publishedAt`.

## DELETE /casting/:id

Bearer, `PRODUCER` or `DIRECTOR`, author only. Drafts only: `204` with no body.
A published or closed role answers `409 CASTING_ROLE_NOT_DRAFT` — close it
instead, so anyone who saw it can still follow the link.

---

# Applications

WBS 1.2.2.2. A member applies to an open casting role with their public profile;
there is no body to fill in. Every application starts as `APPLIED`; the other
Lab 2 statuses — `SHORTLISTED`, `SELECTED`, `REJECTED` — are set by the role's
author in WBS 1.3. Applications cannot be withdrawn.

## Application object

```json
{
  "id": "9a41…",
  "status": "APPLIED",
  "createdAt": "2026-10-05T10:02:00.000Z",
  "updatedAt": "2026-10-05T10:02:00.000Z",
  "castingRole": { "id": "6c1e…", "title": "…", "status": "OPEN", "…": "…" }
}
```

`castingRole` is the role summary described under
[Casting role object](#casting-role-object).

## POST /casting/:id/applications

Bearer, any role. No body — who applies always comes from the token, and any
key in the body (such as `applicantId` or `status`) fails with `422`.

`201 { "application": { … } }`.

The checks, in order:

| Condition                                               | Response                    |
| ------------------------------------------------------- | --------------------------- |
| The role does not exist, or is someone else's `DRAFT`   | `404 NOT_FOUND`             |
| The caller is the role's author                         | `403 NOT_ELIGIBLE`          |
| The role is not `OPEN`                                  | `409 CASTING_ROLE_NOT_OPEN` |
| The caller's profession is not the role's `seekingRole` | `403 NOT_ELIGIBLE`          |
| The caller has already applied                          | `409 ALREADY_APPLIED`       |

The profession is the caller's **current** role, read from the database, as for
every authorization decision. One application per member per role is enforced by
a unique constraint, so concurrent attempts create exactly one. The role row is
locked while the application is written, so an application never lands on a
role that was closed first.

Other failures: `403 FORBIDDEN_ORIGIN`, `401`.

## GET /applications/mine

Bearer. The caller's own applications, most recent first.

| Query      | Rule                                               |
| ---------- | -------------------------------------------------- |
| `status`   | `APPLIED`, `SHORTLISTED`, `SELECTED` or `REJECTED` |
| `page`     | ≥ 1, default 1                                     |
| `pageSize` | 1–50, default 20                                   |

```json
{
  "success": true,
  "message": "Your applications retrieved",
  "data": {
    "applications": [{ "id": "9a41…", "status": "APPLIED", "castingRole": { "…": "…" } }],
    "pagination": { "page": 1, "pageSize": 20, "total": 1, "totalPages": 1 }
  }
}
```

An application stays listed after its role closes; `castingRole.status` then
reads `CLOSED`. Unknown query keys fail with `422`.

---

# Admin

## GET /admin/users

Bearer, `ADMIN` only. A deliberately minimal, read-only, paginated listing whose
purpose is to demonstrate that role policy is enforced on the server. It is not
an admin dashboard: there are no mutations and no fields beyond the safe user
projection.

Query: `page` (default 1), `pageSize` (default 20, maximum 100). Unknown query
keys are rejected.

```json
{
  "data": {
    "users": [{ "id": "…", "name": "…", "email": "…", "role": "ACTOR", "createdAt": "…" }],
    "pagination": { "page": 1, "pageSize": 20, "total": 3, "totalPages": 1 }
  }
}
```

Failures: `401 UNAUTHENTICATED` without a valid token, `403 FORBIDDEN` for any
authenticated non-admin.

There is no API to create an admin or change a role. Admins are made out of band
(direct database update, or `npm run db:seed` with operator-supplied
credentials).

---

# Health

## GET /health

Public. `200` when the API is up and a `SELECT 1` against PostgreSQL succeeds:

```json
{
  "data": { "api": "ok", "database": "connected", "timestamp": "…", "environment": "development" }
}
```

`503 SERVICE_UNAVAILABLE` when the database round-trip fails.
