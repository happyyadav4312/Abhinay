# API Conventions

Cross-cutting rules. The per-endpoint contract is in [`../api.md`](../api.md).

## Base URL

```
http://localhost:5000/api/v1
```

All endpoints are prefixed with `/api/v1` to support future API versioning.

## Response Format

### Success

```json
{
  "success": true,
  "message": "Request successful",
  "data": {}
}
```

### Error

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

`error.code` is stable and machine-readable; clients branch on it. `message` is
for humans and may be reworded without notice. `fieldErrors` appears only when
the failure maps onto specific inputs, and its keys are the request field names
so a form can attach each message to the right control.

A `204` response has no body — do not attempt to parse one.

## HTTP Status Codes

| Code | Meaning                | Usage                                                                                                                                                                        |
| ---- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 200  | OK                     | Successful GET, PUT, PATCH, idempotent POST                                                                                                                                  |
| 201  | Created                | A resource was created                                                                                                                                                       |
| 204  | No Content             | Successful DELETE; no body                                                                                                                                                   |
| 400  | Bad Request            | Malformed before validation: bad JSON, missing multipart field                                                                                                               |
| 401  | Unauthorized           | Missing, invalid, expired or wrong-purpose token                                                                                                                             |
| 403  | Forbidden              | Authenticated but denied: role policy, untrusted origin, missing client header, not eligible to apply (wrong profession, own role)                                           |
| 404  | Not Found              | Unknown route, or a resource that does not exist or is not the caller's — including another user's casting draft                                                             |
| 409  | Conflict               | Duplicate email, or a request that clashes with a resource's current state (editing a closed casting role, an invalid status transition, applying twice or to a closed role) |
| 413  | Payload Too Large      | JSON body over 32 KiB, image over 5 MiB or 6000 px                                                                                                                           |
| 415  | Unsupported Media Type | Not a decodable JPEG, PNG or WebP                                                                                                                                            |
| 422  | Unprocessable Entity   | Well-formed request that fails validation, or a bounded limit exceeded                                                                                                       |
| 429  | Too Many Requests      | Auth rate limit exceeded                                                                                                                                                     |
| 500  | Internal Server Error  | Unexpected fault; generic message only                                                                                                                                       |
| 503  | Service Unavailable    | Database unreachable on `/health`                                                                                                                                            |

## Authentication

Access token, 15 minutes by default, held in browser memory:

```
Authorization: Bearer <access_token>
```

Refresh token, 7 days by default, in an HttpOnly cookie named `refreshToken`
scoped to `Path=/api/v1/auth`, so it is not attached to profile requests.

Cookie-authenticated endpoints (`/auth/refresh`, `/auth/logout`) additionally
require the non-simple header `X-Abhinay-Client: web`.

## CORS and origin policy

Credentialed CORS for exactly one origin (`FRONTEND_URL`) — never `*`.
Allowed methods are `GET`, `POST`, `PUT`, `PATCH` and `DELETE`; a method missing
from that list fails the browser's preflight before the request is sent.
State-changing endpoints reject a present-but-untrusted `Origin`, including the
literal `null`. A request with no `Origin` is a non-browser client and is
allowed; it carries no ambient cookies.

## Rate Limiting

`/auth/register`, `/auth/login` and `/auth/refresh` are limited to
`AUTH_RATE_LIMIT_MAX` requests per `AUTH_RATE_LIMIT_WINDOW_MS` per IP
(defaults: 50 per 15 minutes), answering `429` with code `TOO_MANY_REQUESTS`.

## Input Validation

Request bodies are validated with Zod against `.strict()` schemas, so unknown
keys are rejected rather than ignored — that is what makes an injected `role`
or `passwordHash` fail instead of being silently dropped. Field bounds are
listed in [`../api.md`](../api.md#field-limits) and mirrored by the client-side
schemas in `apps/frontend/src/lib/validation.ts`.

Email is trimmed and lowercased before validation, storage and lookup.
Passwords are never trimmed or case-folded.

## Error Handling

Errors reach the client only through explicit, client-safe error objects.
Anything unexpected is reduced to a generic `500` — no stack traces, no raw
database errors, no internal messages, in any environment. Logs never contain
passwords, authorization headers, cookies, raw tokens or secrets.

## Naming Conventions

| Area          | Convention      | Example                            |
| ------------- | --------------- | ---------------------------------- |
| Endpoints     | kebab-case      | `/api/v1/auth/register`            |
| JSON fields   | camelCase       | `accessToken`, `createdAt`         |
| DB columns    | snake_case      | `password_hash`, `created_at`      |
| Prisma models | PascalCase      | `User`, `ProfileSkill`             |
| Enums         | SCREAMING_SNAKE | `CAMERA_OPERATOR`, `ADMIN`         |
| Error codes   | SCREAMING_SNAKE | `VALIDATION_FAILED`, `EMAIL_TAKEN` |
| Status values | SCREAMING_SNAKE | `DRAFT`, `OPEN`, `CLOSED`          |
