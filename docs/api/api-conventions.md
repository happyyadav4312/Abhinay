# API Conventions

## Base URL

```
http://localhost:5000/api/v1
```

All endpoints are prefixed with `/api/v1` to support future API versioning.

## Response Format

All API responses follow a consistent JSON envelope:

### Success Response

```json
{
  "success": true,
  "message": "Request successful",
  "data": { ... }
}
```

### Error Response

```json
{
  "success": false,
  "message": "Descriptive error message",
  "errors": ["Specific error 1", "Specific error 2"]
}
```

The `errors` array is optional and is used for validation errors or multiple error details.

## HTTP Status Codes

| Code | Meaning               | Usage                                           |
|------|-----------------------|-------------------------------------------------|
| 200  | OK                    | Successful GET, PUT, PATCH, DELETE               |
| 201  | Created               | Successful POST that creates a resource          |
| 400  | Bad Request           | Malformed request syntax                         |
| 401  | Unauthorized          | Missing or invalid authentication                |
| 403  | Forbidden             | Valid auth but insufficient permissions           |
| 404  | Not Found             | Resource or route does not exist                 |
| 409  | Conflict              | Resource already exists (e.g., duplicate email)  |
| 422  | Unprocessable Entity  | Request is well-formed but fails validation      |
| 429  | Too Many Requests     | Rate limit exceeded                              |
| 500  | Internal Server Error | Unexpected server error                          |
| 503  | Service Unavailable   | Dependency unavailable (e.g., database down)     |

## Authentication

### Access Token

Send the access token as a Bearer token in the `Authorization` header:

```
Authorization: Bearer <access_token>
```

### Refresh Token

The refresh token is stored in an **HttpOnly cookie** named `refreshToken`. It is automatically sent with requests to `/api/v1/auth/*` endpoints.

### Auth Endpoints

| Method | Endpoint               | Auth Required | Description               |
|--------|------------------------|---------------|---------------------------|
| POST   | `/api/v1/auth/register`| No            | Create a new account      |
| POST   | `/api/v1/auth/login`   | No            | Log in and receive tokens |
| POST   | `/api/v1/auth/refresh` | Cookie        | Refresh access token      |
| POST   | `/api/v1/auth/logout`  | No            | Clear refresh cookie      |
| GET    | `/api/v1/auth/me`      | Bearer        | Get authenticated user    |

### Other Endpoints

| Method | Endpoint               | Auth Required | Roles    | Description            |
|--------|------------------------|---------------|----------|------------------------|
| GET    | `/api/v1/health`       | No            | —        | API + DB health check  |
| GET    | `/api/v1/test/admin`   | Bearer        | ADMIN    | RBAC test (temporary)  |

## Rate Limiting

Authentication endpoints (`/auth/register`, `/auth/login`, `/auth/refresh`) are rate-limited to:

- **20 requests** per **15-minute window** per IP address

When rate-limited, the API returns:

```json
{
  "success": false,
  "message": "Too many authentication attempts. Please try again later."
}
```

With HTTP status code `429`.

## Input Validation

All request bodies are validated using **Zod** schemas. Validation errors return:

- HTTP status: `422 Unprocessable Entity`
- Response includes specific error messages in the `errors` array

### Register Body

```json
{
  "email": "user@example.com",
  "password": "minimum8chars",
  "role": "ACTOR"
}
```

**Constraints:**
- `email`: Must be a valid email format
- `password`: 8–128 characters
- `role`: Must be one of `ACTOR`, `DIRECTOR`, `PRODUCER`, `CAMERA_OPERATOR`, `EDITOR`, `OTHER_CREW`, `ADMIN`

### Login Body

```json
{
  "email": "user@example.com",
  "password": "password"
}
```

## CORS

CORS is configured to allow only the frontend origin (`FRONTEND_URL` env var). Credentials (cookies) are supported.

## Error Handling

- **Development**: Error responses include `stack` trace and detailed messages.
- **Production**: Error responses include only a generic message—no stack traces or internal details are exposed.

## Naming Conventions

| Area         | Convention     | Example                    |
|--------------|----------------|----------------------------|
| Endpoints    | kebab-case     | `/api/v1/auth/register`    |
| JSON fields  | camelCase      | `accessToken`, `createdAt` |
| DB columns   | snake_case     | `password_hash`, `created_at` |
| Prisma models| PascalCase     | `User`                     |
| Enums        | SCREAMING_SNAKE| `CAMERA_OPERATOR`, `ADMIN` |
