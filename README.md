# UniCRM

UniCRM is UnicodeIT's internal CRM and project operations platform, structured for a future
multi-tenant SaaS release. This repository currently contains Milestone 0: the production-grade
project foundation. CRM business modules and authentication are intentionally not implemented yet.

The architecture follows [the UniCRM blueprint](docs/UNICRM_BLUEPRINT.md): a pnpm/Turborepo
TypeScript monorepo, a Next.js frontend, a modular NestJS REST API, PostgreSQL through Prisma, and
Redis.

## Requirements

- Node.js 22 or newer
- pnpm 10 or newer (Corepack is recommended)
- Docker Engine with Docker Compose

## Setup

From the repository root:

```bash
cp .env.example .env
corepack enable
pnpm install
docker compose up -d
pnpm prisma:generate
pnpm prisma:migrate --name foundation
pnpm dev
```

On PowerShell, use `Copy-Item .env.example .env` instead of `cp` if `cp` is unavailable.

The example credentials are for local development only. Change them before using any shared or
deployed environment, and keep real environment files out of Git.

## Local services

| Service         | URL or port                         |
| --------------- | ----------------------------------- |
| Web             | http://localhost:3000               |
| API             | http://localhost:4000/api/v1        |
| Health endpoint | http://localhost:4000/api/v1/health |
| PostgreSQL      | localhost:5432                      |
| Redis           | localhost:6379                      |

The web root is a development verification page. It fetches the API health endpoint and shows the
current API, PostgreSQL, and Redis connectivity state.

## Commands

```bash
pnpm dev                 # Run web and API in watch mode
pnpm build               # Build every workspace
pnpm lint                # Run ESLint across the monorepo
pnpm typecheck           # Run strict TypeScript checks
pnpm test                # Run the test suites
pnpm format              # Format source files
pnpm format:check        # Check formatting without changes
pnpm prisma:generate     # Generate the Prisma client
pnpm prisma:migrate      # Create/apply a development migration
pnpm prisma:studio       # Open Prisma Studio
```

Use `docker compose ps` to inspect infrastructure health and `docker compose down` to stop local
services. Named volumes retain PostgreSQL and Redis data across restarts. Use `docker compose down
-v` only when intentionally deleting local development data.

## Repository layout

```text
apps/
  api/          NestJS modular monolith and Prisma schema
  web/          Next.js App Router frontend
packages/
  config/       Shared strict TypeScript configurations
  types/        Cross-application TypeScript contracts
  ui/           Design-system package placeholder for Milestone 1
  validation/   Shared schema package placeholder for future domain modules
infrastructure/
  docker/       Docker infrastructure notes
  nginx/        Future same-origin reverse-proxy configuration
docs/           Architecture and product blueprint
```

## Environment configuration

Copy `.env.example` to `.env` before running the applications. The API validates its host, port,
CORS origins, PostgreSQL URL, Redis URL, and runtime environment during startup. The web app
validates `NEXT_PUBLIC_API_URL`. Startup fails with a clear message when required values are absent
or invalid.

Only `NEXT_PUBLIC_*` values are exposed to browser code. Never place credentials or private service
URLs in those variables. Production API configuration rejects wildcard CORS origins.

## Milestone boundary

Milestone 0 contains infrastructure and connectivity only. Leads, companies, contacts, projects,
tasks, quotations, payments, reports, dashboard business logic, authentication, authorization,
queues, and other later blueprint modules are out of scope.
