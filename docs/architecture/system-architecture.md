# System Architecture

## Overview

Abhinay is a film production networking and casting platform. The architecture follows a modern full-stack monorepo pattern with clear separation of concerns.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                      Client (Browser)                   │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│                  Next.js Frontend (App Router)          │
│                  http://localhost:3000                   │
│                                                         │
│  ┌─────────┐  ┌──────────┐  ┌────────┐  ┌───────────┐ │
│  │  Pages   │  │Components│  │  Hooks │  │ API Client│ │
│  └─────────┘  └──────────┘  └────────┘  └─────┬─────┘ │
└────────────────────────────────────┬────────────────────┘
                                     │ REST API (JSON)
                                     ▼
┌─────────────────────────────────────────────────────────┐
│              Express Backend (REST API)                  │
│              http://localhost:5000/api/v1                │
│                                                         │
│  ┌──────────┐  ┌───────────┐  ┌──────────────────────┐ │
│  │  Routes   │  │Controllers│  │     Middleware        │ │
│  │          │  │           │  │  ┌─────────────────┐  │ │
│  │ /health  │  │           │  │  │ Auth (JWT)      │  │ │
│  │ /auth    │  │           │  │  │ RBAC (Roles)    │  │ │
│  │ /test    │  │           │  │  │ Error Handler   │  │ │
│  └────┬─────┘  └─────┬─────┘  │  │ Rate Limiter    │  │ │
│       │              │        │  │ Helmet/CORS     │  │ │
│       │              ▼        │  └─────────────────┘  │ │
│       │       ┌───────────┐   └──────────────────────┘ │
│       │       │  Services  │                            │
│       │       └─────┬─────┘                             │
│       │             │                                   │
│       │             ▼                                   │
│       │      ┌─────────────┐                            │
│       │      │   Prisma    │                            │
│       │      │    ORM      │                            │
│       │      └──────┬──────┘                            │
└───────┼─────────────┼──────────────────────────────────┘
        │             │
        │             ▼
┌─────────────────────────────────────────────────────────┐
│                PostgreSQL (Docker)                       │
│                localhost:5432                             │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Database: abhinay                              │    │
│  │  ┌────────────┐                                 │    │
│  │  │   users    │  (future: profiles, projects,   │    │
│  │  └────────────┘   castings, applications, etc.) │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

## Technology Stack

| Layer       | Technology                    | Purpose                         |
|-------------|-------------------------------|---------------------------------|
| Frontend    | Next.js (App Router)          | React framework with SSR/SSG    |
| Styling     | Tailwind CSS                  | Utility-first CSS               |
| Language    | TypeScript                    | Type safety across the stack    |
| Backend     | Express.js                    | REST API server                 |
| ORM         | Prisma                        | Type-safe database access       |
| Database    | PostgreSQL 16                 | Relational database             |
| Auth        | JWT (jsonwebtoken)            | Stateless authentication        |
| Hashing     | bcrypt                        | Secure password hashing         |
| Validation  | Zod                           | Runtime input validation        |
| Container   | Docker Compose                | Local PostgreSQL provisioning   |
| Linting     | ESLint                        | Code quality enforcement        |

## Authentication Flow

```
┌──────────┐      ┌───────────┐      ┌────────────┐
│  Client   │      │  Express   │      │ PostgreSQL │
└─────┬────┘      └─────┬─────┘      └──────┬─────┘
      │                  │                    │
      │  POST /login     │                    │
      │─────────────────>│                    │
      │                  │  Find user by email│
      │                  │───────────────────>│
      │                  │    User record     │
      │                  │<───────────────────│
      │                  │                    │
      │                  │ Compare password   │
      │                  │ (bcrypt)           │
      │                  │                    │
      │                  │ Generate tokens:   │
      │                  │ ┌───────────────┐  │
      │                  │ │ Access Token  │  │
      │                  │ │ (15m, Bearer) │  │
      │                  │ ├───────────────┤  │
      │                  │ │ Refresh Token │  │
      │                  │ │ (7d, Cookie)  │  │
      │                  │ └───────────────┘  │
      │                  │                    │
      │  Access Token +  │                    │
      │  HttpOnly Cookie │                    │
      │<─────────────────│                    │
      │                  │                    │
```

### Token Strategy

| Token          | Storage         | Lifetime | Purpose                     |
|----------------|-----------------|----------|-----------------------------|
| Access Token   | Client memory   | 15 min   | Authorize API requests      |
| Refresh Token  | HttpOnly cookie | 7 days   | Obtain new access tokens    |

### Token Refresh Flow

```
Client ──> POST /auth/refresh (cookie) ──> Server
Server ──> Verify refresh token
       ──> Lookup user in DB
       ──> Issue new access token + new refresh token
       ──> Return access token + set new cookie
```

## Role-Based Access Control (RBAC)

```
RBAC Roles
├── ACTOR
├── DIRECTOR
├── PRODUCER
├── CAMERA_OPERATOR
├── EDITOR
├── OTHER_CREW
└── ADMIN
```

### Authorization Flow

```
Request
  │
  ▼
authenticate()        ── Verify JWT ── 401 if invalid
  │
  ▼
requireRole(roles)    ── Check role  ── 403 if insufficient
  │
  ▼
Controller/Handler    ── Process request
```

## Request Processing Pipeline

```
Incoming Request
  │
  ├── Helmet (security headers)
  ├── CORS (origin validation)
  ├── JSON parser
  ├── Cookie parser
  ├── Morgan (request logging)
  │
  ├── /api/v1/* routes
  │   ├── Rate limiter (auth routes)
  │   ├── Auth middleware (protected routes)
  │   ├── Role middleware (restricted routes)
  │   ├── Controller (thin, delegation only)
  │   ├── Service (business logic)
  │   └── Prisma (database access)
  │
  ├── 404 handler (unmatched routes)
  └── Error handler (centralized)
```

## Monorepo Structure

```
abhinay/
├── apps/
│   ├── web/          # Next.js frontend
│   └── api/          # Express backend
├── docs/             # Project documentation
├── docker-compose.yml
├── .env.example
├── .gitignore
├── package.json      # Workspace root
└── README.md
```

The monorepo uses npm workspaces. Frontend and backend are independently runnable but share the root `.env` and can be started together from the root.
