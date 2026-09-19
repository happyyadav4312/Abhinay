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
`FORBIDDEN_ORIGIN` (403), `MISSING_CLIENT_HEADER` (403), `NOT_FOUND` (404),
`EMAIL_TAKEN` (409), `PAYLOAD_TOO_LARGE` (413), `UNSUPPORTED_MEDIA_TYPE` (415),
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
| `password`                          | ≥ 12 characters and ≤ 72 UTF-8 bytes; never trimmed or case-folded                     |
| `bio`                               | ≤ 1000 characters                                                                      |
| `location`                          | ≤ 120 characters                                                                       |
| `phone`                             | ≤ 32 characters, optional, never shown publicly                                        |
| skill `name`                        | 2–40 characters, letters/numbers plus `. , ' & + / # -`; at most 30 skills per profile |
| experience `title` / `organization` | 1–120 characters                                                                       |
| experience `description`            | ≤ 2000 characters; at most 50 entries per profile                                      |
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
