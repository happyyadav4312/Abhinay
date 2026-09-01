# 🎬 Abhinay

**Film Production Networking and Casting Platform**

Abhinay is a professional networking and casting platform for film-industry professionals. It connects actors, directors, producers, camera operators, editors, and other crew members — enabling casting, collaboration, and project management in one place.

---

## Technology Stack

| Category       | Technology                         |
|----------------|------------------------------------|
| Frontend       | Next.js (App Router), TypeScript   |
| Styling        | Tailwind CSS                       |
| Backend        | Express.js, TypeScript             |
| Database       | PostgreSQL 16                      |
| ORM            | Prisma                             |
| Authentication | JWT (access + refresh tokens)      |
| Authorization  | Role-Based Access Control (RBAC)   |
| Validation     | Zod                                |
| Hashing        | bcrypt                             |
| Containerization | Docker Compose (PostgreSQL)      |
| Linting        | ESLint                             |

---

## Repository Structure

```
abhinay/
├── apps/
│   ├── web/              # Next.js frontend
│   │   └── src/
│   │       ├── app/      # App Router pages
│   │       ├── components/
│   │       ├── hooks/
│   │       ├── lib/      # API client, utilities
│   │       ├── services/
│   │       ├── types/
│   │       └── constants/
│   │
│   └── api/              # Express backend
│       ├── src/
│       │   ├── config/   # Environment, database
│       │   ├── controllers/
│       │   ├── middleware/
│       │   ├── routes/
│       │   ├── services/
│       │   ├── types/
│       │   └── utils/
│       └── prisma/       # Schema, migrations, seed
│
├── docs/                 # Documentation
│   ├── architecture/
│   ├── database/
│   └── api/
│
├── docker-compose.yml
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

---

## Prerequisites

Ensure you have the following installed:

- **Node.js** ≥ 18.x
- **npm** ≥ 9.x
- **Docker** & **Docker Compose**
- **Git**

---

## Installation

### 1. Clone the repository

```bash
git clone <repository-url>
cd abhinay
```

### 2. Set up environment variables

```bash
cp .env.example .env
```

Edit `.env` and update the following values:

- `JWT_ACCESS_SECRET` — Generate with: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
- `JWT_REFRESH_SECRET` — Generate a **different** secret using the same command
- `POSTGRES_PASSWORD` — Choose a strong password
- Update `DATABASE_URL` to match your `POSTGRES_USER` and `POSTGRES_PASSWORD`

### 3. Start the database

```bash
docker compose up -d
```

### 4. Install dependencies

```bash
npm install
```

### 5. Run database migrations

```bash
cd apps/api
npx prisma migrate dev --name init
npx prisma generate
```

### 6. Seed the database (optional)

```bash
npx prisma db seed
```

This creates a development admin user:
- Email: `admin@abhinay.dev`
- Password: `Admin@123`

---

## Development

### Start everything from root

```bash
npm run dev
```

### Start individually

```bash
# Backend (port 5000)
npm run dev:api

# Frontend (port 3000)
npm run dev:web

# Database
docker compose up -d
```

### Other useful commands

```bash
# Build all
npm run build

# Lint all
npm run lint

# Open Prisma Studio (DB GUI)
npm run db:studio
```

---

## Environment Variables

| Variable                 | Description                          | Default                    |
|--------------------------|--------------------------------------|----------------------------|
| `NODE_ENV`               | Environment mode                     | `development`              |
| `PORT`                   | Backend server port                  | `5000`                     |
| `DATABASE_URL`           | PostgreSQL connection string         | —                          |
| `JWT_ACCESS_SECRET`      | Secret for signing access tokens     | —                          |
| `JWT_REFRESH_SECRET`     | Secret for signing refresh tokens    | —                          |
| `ACCESS_TOKEN_EXPIRES_IN`| Access token lifetime                | `15m`                      |
| `REFRESH_TOKEN_EXPIRES_IN`| Refresh token lifetime              | `7d`                       |
| `FRONTEND_URL`           | Frontend URL for CORS                | `http://localhost:3000`    |
| `NEXT_PUBLIC_API_URL`    | Backend URL for frontend API calls   | `http://localhost:5000/api/v1` |
| `POSTGRES_DB`            | PostgreSQL database name             | `abhinay`                  |
| `POSTGRES_USER`          | PostgreSQL username                  | `abhinay_user`             |
| `POSTGRES_PASSWORD`      | PostgreSQL password                  | —                          |
| `POSTGRES_PORT`          | PostgreSQL port                      | `5432`                     |

> ⚠️ Never commit `.env` to version control. Use `.env.example` as a template.

---

## API

### Base URL

```
http://localhost:5000/api/v1
```

### Endpoints

| Method | Endpoint               | Auth     | Description                |
|--------|------------------------|----------|----------------------------|
| GET    | `/health`              | —        | API + database health check|
| POST   | `/auth/register`       | —        | Register a new user        |
| POST   | `/auth/login`          | —        | Login and receive JWT      |
| POST   | `/auth/refresh`        | Cookie   | Refresh access token       |
| POST   | `/auth/logout`         | —        | Clear refresh cookie       |
| GET    | `/auth/me`             | Bearer   | Get authenticated user     |
| GET    | `/test/admin`          | Bearer + ADMIN | RBAC test (dev only) |

### Example: Register

```bash
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "actor@example.com",
    "password": "password123",
    "role": "ACTOR"
  }'
```

### Example: Login

```bash
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "email": "actor@example.com",
    "password": "password123"
  }'
```

### Example: Get authenticated user

```bash
curl http://localhost:5000/api/v1/auth/me \
  -H "Authorization: Bearer <access_token>"
```

---

## Documentation

- [System Architecture](docs/architecture/system-architecture.md)
- [Database Design](docs/database/database-design.md)
- [API Conventions](docs/api/api-conventions.md)

---

## License

UNLICENSED — Private project.
