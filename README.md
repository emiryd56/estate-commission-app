# Estate Commission App

> Languages: **English** · [Türkçe](./README.tr.md)

A full-stack application for managing real-estate transactions through the
agreement → earnest money → title deed → completed pipeline and, on
completion, automatically computing how the commission is split between
the agency and the involved consultants.

The project is built as a monorepo with two independently runnable packages:

- **`backend/`** — NestJS 11 + Mongoose + MongoDB Atlas, JWT auth, RBAC,
  PDF export, Swagger docs, health checks, rate limiting.
- **`frontend/`** — Nuxt 3 + Vue 3 Composition API, Pinia, Tailwind CSS,
  typed API client, searchable selects, debounced search.

A deeper dive into the design rationale lives in [`DESIGN.md`](./DESIGN.md).

---

## Live Deployment

The app is deployed and publicly reachable:

| Service  | URL                                               |
| -------- | ------------------------------------------------- |
| Frontend | [https://estate-comission-app.vercel.app](https://estate-comission-app.vercel.app)                          |
| Backend  | [https://estate-comission-app.onrender.com](https://estate-comission-app.onrender.com)                            |
| Health   | [https://estate-comission-app.onrender.com/health](https://estate-comission-app.onrender.com/health)              |

Sign in with the seed admin credentials (`admin@example.com` / `admin123`) or
any seeded agent (`alex@company.com` / `agent123`, `priya@company.com` /
`agent123`, `james@company.com` / `agent123`). See
[Seeding Default Accounts](#seeding-default-accounts) for the full list.

> The backend is hosted on Render's free tier, so the first request after a
> period of inactivity may take ~30 seconds while the instance wakes up.

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Repository Layout](#repository-layout)
3. [Prerequisites](#prerequisites)
4. [Quick Start](#quick-start)
5. [Environment Variables](#environment-variables)
6. [Seeding Default Accounts](#seeding-default-accounts)
7. [Running the Apps](#running-the-apps)
8. [Testing](#testing)
9. [API Overview](#api-overview)
10. [Feature Walkthrough](#feature-walkthrough)
11. [Build & Deployment](#build--deployment)
12. [Troubleshooting](#troubleshooting)
13. [Scripts Reference](#scripts-reference)

---

## Tech Stack

| Layer              | Choice                                                              |
| ------------------ | ------------------------------------------------------------------- |
| Backend runtime    | Node.js 20+ / NestJS 11                                             |
| Database           | MongoDB Atlas (accessed via Mongoose 9)                             |
| Auth               | JWT (`@nestjs/jwt` + `passport-jwt`), bcrypt password hashing       |
| Validation         | `class-validator` + `class-transformer` with global `ValidationPipe`|
| API docs           | Swagger UI at `/docs` (`@nestjs/swagger`)                           |
| Security           | `helmet`, `@nestjs/throttler`, CORS via env                         |
| PDF generation     | `pdfkit` + DejaVu fonts (Turkish character support)                 |
| Health checks      | `@nestjs/terminus` + Mongo ping at `/health`                        |
| Frontend framework | Nuxt 3 (Vue 3, Vite, Nitro)                                         |
| State management   | Pinia (auth, users, transactions stores)                            |
| Styling            | Tailwind CSS + custom `SearchableSelect` component                  |
| Testing            | Jest (backend unit & service tests), `vue-tsc` / `tsc` type checks  |
| Tooling            | ESLint + Prettier (backend), `concurrently` for single-command dev  |

---

## Repository Layout

```
estate-comission-app/
├── backend/                  # NestJS API
│   ├── src/
│   │   ├── auth/             # JWT strategy, guards, login/me controllers
│   │   ├── users/            # User schema, RBAC-guarded CRUD
│   │   ├── transactions/     # Core domain: schemas, DTOs, service, controller
│   │   │   ├── utils/        # commission-calculator, stage-transitions, PDF
│   │   │   └── schemas/      # Mongoose schemas (transaction, stage history…)
│   │   ├── app.controller.ts # /health endpoint (terminus)
│   │   ├── app.module.ts     # Throttler, Mongoose, modules wiring
│   │   └── main.ts           # helmet, CORS, Swagger, ValidationPipe
│   ├── scripts/
│   │   ├── seed.ts           # Creates admin + a few consultants
│   │   └── promote-admin.ts  # Promotes an existing user to admin
│   └── src/assets/fonts/     # DejaVu TTFs used by pdfkit
├── frontend/                 # Nuxt 3 client
│   ├── pages/                # login, dashboard (index), /transactions/[id], new, users
│   ├── components/           # SearchableSelect.vue (generic combobox)
│   ├── stores/               # Pinia stores (auth, user, transaction)
│   ├── composables/useApi.ts # Typed $fetch client with auth/401 handling
│   ├── middleware/           # auth.global route guard
│   ├── plugins/              # auth plugin hydrating the user from the JWT
│   ├── utils/                # jwt, stage labels, error formatter
│   └── types/                # Frontend-side DTO/interfaces
├── DESIGN.md                 # Architecture decisions and rationale
├── README.md                 # This file
└── package.json              # Root orchestration scripts (concurrently)
```

---

## Prerequisites

- **Node.js 20 LTS** (or newer) and **npm 10+**
- A **MongoDB Atlas** cluster (free M0 tier is sufficient) or a local MongoDB 6+
  instance. The API uses standard `mongodb+srv://…` or `mongodb://…` URIs.
- Git (optional, for cloning)

Check your local versions:

```bash
node -v      # v20.x.x or newer
npm -v       # 10.x.x or newer
```

---

## Quick Start

From a clean clone, this is the fastest path to a working app:

```bash
# 1. Install dependencies for root, backend and frontend in one go
npm run install:all

# 2. Create backend environment file and fill in MONGODB_URI + JWT_SECRET
cp backend/.env.example backend/.env
$EDITOR backend/.env

# 3. (Optional but recommended) create frontend env file
cp frontend/.env.example frontend/.env

# 4. Seed the default admin + a few consultants
npm run seed

# 5. Start backend (:3001) and frontend (:3000) side by side
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with the
default admin credentials printed by the seed script.

---

## Environment Variables

### Backend (`backend/.env`)

| Variable              | Required | Default                    | Purpose                                                                 |
| --------------------- | -------- | -------------------------- | ----------------------------------------------------------------------- |
| `MONGODB_URI`         | yes      | —                          | Mongo connection string used by `MongooseModule`.                       |
| `PORT`                | no       | `3001`                     | HTTP port the NestJS server binds to.                                   |
| `JWT_SECRET`          | yes      | —                          | Secret used to sign and verify JWTs. **Rotate before production.**      |
| `JWT_EXPIRES_IN`      | no       | `1d`                       | JWT lifetime (e.g. `1h`, `7d`).                                         |
| `CORS_ORIGIN`         | no       | `http://localhost:3000`    | Comma-separated list of allowed browser origins.                        |
| `THROTTLE_TTL_MS`     | no       | `60000`                    | Rate limit window for `@nestjs/throttler`.                              |
| `THROTTLE_LIMIT`      | no       | `100`                      | Max requests per window per IP (default throttler).                     |
| `SEED_ADMIN_EMAIL`    | no       | `admin@example.com`        | Admin email created by `npm run seed`.                                  |
| `SEED_ADMIN_PASSWORD` | no       | `admin123`                 | Admin password created by `npm run seed`.                               |
| `SEED_ADMIN_NAME`     | no       | `Admin User`               | Admin display name created by `npm run seed`.                           |

An up-to-date template is kept in `backend/.env.example`.

### Frontend (`frontend/.env`)

| Variable                | Required | Default                  | Purpose                                                      |
| ----------------------- | -------- | ------------------------ | ------------------------------------------------------------ |
| `NUXT_PUBLIC_API_BASE`  | no       | `http://localhost:3001`  | Base URL the browser uses to call the NestJS API.            |

`runtimeConfig.public.apiBase` defaults to `http://localhost:3001` so the
`.env` file is only needed when the API lives elsewhere (staging, prod).

---

## Seeding Default Accounts

The seed script is idempotent: it inserts accounts only when they don't
already exist and skips duplicates. Run it any time:

```bash
npm run seed
```

Default credentials (override through env vars listed above):

| Role  | Email                | Password   |
| ----- | -------------------- | ---------- |
| admin | `admin@example.com`  | `admin123` |
| agent | `alex@company.com`   | `agent123` |
| agent | `priya@company.com`  | `agent123` |
| agent | `james@company.com`  | `agent123` |

To promote an existing user to admin instead of re-seeding:

```bash
npm --prefix backend run promote-admin -- someone@example.com
```

---

## Running the Apps

### Option A — both apps in one terminal (recommended)

```bash
npm run dev
```

Under the hood this runs `backend/npm run start:dev` and `frontend/npm run dev`
side by side via `concurrently`, colour-coding their output.

### Option B — separate terminals

```bash
# Terminal 1
npm run dev:backend        # NestJS on http://localhost:3001

# Terminal 2
npm run dev:frontend       # Nuxt on   http://localhost:3000
```

### Verifying the backend is up

```bash
curl http://localhost:3001/health
# → { "status": "ok", "info": { "mongodb": { "status": "up" } }, ... }
```

Interactive API docs live at [http://localhost:3001/docs](http://localhost:3001/docs)
(click **Authorize** and paste the JWT returned by `POST /auth/login` to try
protected endpoints).

---

## Testing

```bash
# Backend unit & service tests (Jest, 44 cases across commission, transitions, service)
npm test

# Backend coverage report (writes to backend/coverage/)
npm run test:cov

# Frontend type check
npm --prefix frontend exec vue-tsc -- --noEmit

# Backend lint (with --fix)
npm run lint
```

CI-friendly single command:

```bash
npm test && npm run lint
```

---

## API Overview

All endpoints are mounted under the backend port (`3001` by default). Every
route except `POST /auth/login` and `GET /health` requires an
`Authorization: Bearer <jwt>` header.

| Method | Path                          | Roles          | Notes                                                       |
| ------ | ----------------------------- | -------------- | ----------------------------------------------------------- |
| POST   | `/auth/login`                 | public         | Returns `{ accessToken, user }`. Rate-limited (10/min).     |
| GET    | `/auth/me`                    | any auth       | Returns the decoded token's `{ userId, name, email, role }`. |
| POST   | `/users`                      | admin               | Creates a user (consultant or admin).                       |
| GET    | `/users`                      | admin, consultant   | Lists users (used by consultant pickers).                   |
| GET    | `/transactions`               | admin, consultant   | Paginated list; supports `search`, `stage`, price/date/consultant filters. |
| POST   | `/transactions`               | admin, consultant   | Consultants may only list themselves as `listingAgent` or `sellingAgent`. |
| GET    | `/transactions/:id`           | admin, consultant   | Consultants only see their own transactions.                |
| PATCH  | `/transactions/:id/stage`     | admin, consultant   | Atomic forward-only transition; 409 on concurrent change.   |
| GET    | `/transactions/:id/export`    | admin, consultant   | Streams a styled PDF report.                                |
| GET    | `/health`                     | public         | Terminus health-check (Mongo ping).                         |
| GET    | `/docs`                       | public         | Swagger UI.                                                 |

### Example — login + list

```bash
TOKEN=$(curl -s http://localhost:3001/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"admin123"}' | jq -r .accessToken)

curl -s http://localhost:3001/transactions \
  -H "Authorization: Bearer $TOKEN" | jq '.total, .data[0]'
```

### Advanced filters

`GET /transactions` accepts any combination of the following query params:

| Param         | Type     | Effect                                                                  |
| ------------- | -------- | ----------------------------------------------------------------------- |
| `page`        | int ≥1   | Page number (default `1`).                                              |
| `limit`       | int 1-100| Items per page (default `10`).                                          |
| `search`      | string   | Case-insensitive regex match on `title` (regex-safe escaped server-side).|
| `stage`       | enum     | `agreement`, `earnest_money`, `title_deed`, `completed`.                |
| `minTotalFee` | number ≥0| Lower bound of `totalFee`.                                              |
| `maxTotalFee` | number ≥0| Upper bound of `totalFee`.                                              |
| `startDate`   | ISO date | `createdAt >= startDate`.                                               |
| `endDate`     | ISO date | `createdAt <= endDate 23:59:59`.                                        |
| `agentId`     | ObjectId | **Admin only.** Restricts to transactions where the selected user is either the listing or the selling consultant. |

---

## Feature Walkthrough

- **Login flow** — JWT returned by the API is stored in a `lax` cookie; the
  Nuxt plugin hydrates the Pinia `auth` store from the token on page load,
  and the global route middleware enforces both `authenticated` and
  `admin-only` pages (checks expiry against `exp`).
- **Dashboard (`/`)** — Lists transactions with search (500 ms debounced),
  stage filter, collapsible "Advanced Filters" panel, pagination, and
  per-row quick actions (Advance Stage, View Detail).
- **New transaction (`/transactions/new`)** — Searchable selects for listing
  and selling consultants; consultants must pick themselves on at least one
  side (enforced server-side).
- **Transaction detail (`/transactions/[id]`)** — Summary card, vertical
  timeline derived from `stageHistory`, dynamic commission breakdown table,
  and a one-click **Download PDF** button that calls `/transactions/:id/export`.
- **User management (`/users`, admin only)** — Create consultants/admins and
  list existing users; name, email, role and avatar.
- **PDF export** — Multi-section A4 report with agency branding, stage
  badge, key/value table, stage history, and financial breakdown. Uses
  DejaVu fonts bundled as Nest assets to render Turkish characters.
- **Concurrency safety** — Stage advances use `findOneAndUpdate` gated on
  the current stage, so two simultaneous writers cannot both win.
- **Audit trail** — Every `StageHistoryEntry` records `changedBy`, and the
  transaction timeline surfaces it inline (`{date} · {name} tarafından`).

---

## Build & Deployment

### Production builds

```bash
npm run build
# ├── backend/dist/          (compiled NestJS + copied font assets)
# └── frontend/.output/      (Nitro server + public assets)

# Start the backend from its compiled output
NODE_ENV=production node backend/dist/main.js

# Start the Nuxt server (Nitro)
node frontend/.output/server/index.mjs
```

### Backend hosting notes

- Any Node host works (Render, Railway, Fly.io, Heroku, AWS App Runner).
- Provide all backend env vars at runtime. Do **not** commit `.env`.
- Expose port `3001` (or map `PORT`).
- Point health checks to `GET /health`.
- Set `CORS_ORIGIN` to the deployed frontend URL (comma-separated list if
  multiple, e.g. preview + prod).

### Frontend hosting notes

- Nuxt 3 can be deployed as a Node server (any Node host) or exported to
  static if desired. The default Nitro build at `frontend/.output/` is the
  Node preset.
- Set `NUXT_PUBLIC_API_BASE` to the deployed backend base URL (no trailing
  slash).

### Container-friendly build

Although no Dockerfile is checked in, the `npm run build` + `node dist/main.js`
combo is the blueprint for a two-stage `Dockerfile` should you need one.

---

## Troubleshooting

**`MONGODB_URI environment variable is not defined`** at startup.
Ensure `backend/.env` exists and `MONGODB_URI` is set. If you are running
the app via `npm run dev` from the repo root, the script changes into
`backend/` so its `.env` is picked up automatically — as long as it exists.

**Login returns `429 Too Many Requests`.**
The `POST /auth/login` endpoint is rate-limited to 10 requests per minute
per IP to mitigate brute force. Wait ~60 seconds and retry.

**`409 Conflict` when advancing a stage.**
Another writer (tab, device) beat you to it. Reload the transaction and
try again — the server guarantees a single winner per transition.

**`403 Forbidden` when a consultant creates a transaction.**
Consultants may only create transactions where they are either the listing
or selling consultant. Pick yourself on at least one side.

**PDF export contains question marks instead of Turkish characters.**
The DejaVu fonts under `backend/src/assets/fonts/` weren't copied to
`backend/dist/` during build. Confirm `backend/nest-cli.json` still declares
the `assets` block and rebuild.

**Frontend calls `http://localhost:3000/transactions` (404).**
Your `apiBase` is pointing to the Nuxt origin instead of the API. Either
leave `NUXT_PUBLIC_API_BASE` unset (it defaults to `3001`) or point it at
your backend URL explicitly.

**`EADDRINUSE` on port 3001.**
Another backend process is still holding the port. Terminate it:
```bash
lsof -ti:3001 | xargs kill -9
```

---

## Scripts Reference

Top-level (root) scripts:

| Command                | Runs                                                         |
| ---------------------- | ------------------------------------------------------------ |
| `npm run install:all`  | Installs root, `backend/` and `frontend/` dependencies.      |
| `npm run dev`          | Boots backend + frontend side by side with `concurrently`.   |
| `npm run dev:backend`  | NestJS in watch mode only.                                   |
| `npm run dev:frontend` | Nuxt dev server only.                                        |
| `npm run build`        | Production build for both apps.                              |
| `npm test`             | Backend unit tests (Jest).                                   |
| `npm run test:cov`     | Backend coverage report.                                     |
| `npm run lint`         | Backend ESLint with `--fix`.                                 |
| `npm run seed`         | Seeds admin + 3 consultants (idempotent).                    |

Backend-local scripts (from `backend/`) of interest:

| Command                      | Runs                                                     |
| ---------------------------- | -------------------------------------------------------- |
| `npm run start:dev`          | NestJS in watch mode.                                    |
| `npm run start:prod`         | Runs compiled `dist/main.js`.                            |
| `npm run seed`               | `scripts/seed.ts` via `ts-node`.                         |
| `npm run promote-admin`      | Promotes an existing email to `admin`.                   |

Happy coding!
