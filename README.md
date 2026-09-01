# UniCRM

UniCRM is UnicodeIT's internal CRM and project operations platform, structured for a future
multi-tenant SaaS release. Milestones 0-3 provide the monorepo, application shell, first-party
identity and access foundation, and the core company, contact, lead, activity, and follow-up flow.

The architecture follows [the UniCRM blueprint](docs/UNICRM_BLUEPRINT.md): a pnpm/Turborepo
TypeScript monorepo, Next.js, a modular NestJS REST API, PostgreSQL through Prisma, and Redis.

## Requirements

- Node.js 22 or newer
- pnpm 10 or newer through Corepack
- Docker Engine with Docker Compose

## Local setup

```bash
cp .env.example .env
corepack enable
pnpm install
docker compose up -d
pnpm prisma:generate
pnpm prisma:migrate
pnpm bootstrap
pnpm dev
```

On PowerShell, use `Copy-Item .env.example .env` instead of `cp`. Before `pnpm bootstrap`, replace
the example bootstrap password and development email key in `.env`. The bootstrap command is
idempotent: it creates missing permissions, default roles, and the organization's default sales
pipeline, but it never resets or recreates an existing Owner. Run it once after the Milestone 3
migration to initialize CRM permissions and the pipeline for organizations created earlier.

Open `http://localhost:3000/login` and sign in with `UNICRM_BOOTSTRAP_ADMIN_EMAIL` and
`UNICRM_BOOTSTRAP_ADMIN_PASSWORD`.

## Services

| Service         | URL or port                         |
| --------------- | ----------------------------------- |
| Web             | http://localhost:3000               |
| API             | http://localhost:4000/api/v1        |
| Health endpoint | http://localhost:4000/api/v1/health |
| PostgreSQL      | localhost:`POSTGRES_PORT`           |
| Redis           | localhost:`REDIS_PORT`              |

## Commands

```bash
pnpm dev                 # Run web and API in watch mode
pnpm build               # Build every workspace
pnpm lint                # Run ESLint across the monorepo
pnpm typecheck           # Run strict TypeScript checks
pnpm test                # Run all tests (PostgreSQL and Redis must be running)
pnpm format              # Format source files
pnpm format:check        # Check formatting without changes
pnpm prisma:generate     # Generate the Prisma client
pnpm prisma:migrate      # Create or apply development migrations
pnpm prisma:deploy       # Apply committed migrations in deployment environments
pnpm prisma:studio       # Open Prisma Studio
pnpm bootstrap           # Create the initial organization, roles, and Owner once
```

Use `docker compose ps` to inspect infrastructure health and `docker compose down` to stop local
services. Named volumes retain data. Use `docker compose down -v` only when intentionally deleting
local development data.

## Authentication

UniCRM uses first-party, database-backed browser sessions. Login creates a random opaque token and
places it in an HttpOnly cookie; PostgreSQL stores only its SHA-256 hash. Passwords use Argon2id with
the explicit memory, time, and parallelism values from `.env`. No authentication token is stored in
browser storage.

Local HTTP development uses `Secure=false`. Production validation requires `Secure=true`; for the
same-origin production deployment, set `SESSION_COOKIE_NAME=__Host-unicrm_session` and retain
`Path=/` with no Domain attribute. Cookies use `SameSite=Lax`. `SESSION_TTL_SECONDS` controls the
single source of session lifetime.

Authenticated `POST`, `PUT`, `PATCH`, and `DELETE` requests require both an allowed `Origin` and a
session-bound double-submit token: the readable CSRF cookie must match `X-CSRF-Token`, and its hash
must match the session row. The API still enforces tenant scope and permissions independently.

## Invitations and reset email

`EMAIL_TRANSPORT=console` is development-only. It stores up to 50 messages in memory without logging
token URLs. Inspect them while the API process is running:

```bash
curl -H "X-Dev-Email-Key: <DEV_EMAIL_KEY>" http://localhost:4000/api/v1/dev/emails
```

Invitation creation also returns the one-time invitation URL to its authorized caller. Forgot
password always returns the same response whether an account exists. Invitation and reset tokens
are random, time-limited, single-use, and stored only as hashes.

For production, configure:

```text
EMAIL_TRANSPORT=smtp
EMAIL_FROM=
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=
```

Production startup rejects the development email transport.

## Identity API

Identity endpoints live under `/api/v1`: authentication and sessions under `/auth`, users and
invitations under `/users`, organization settings under `/organization`, and RBAC under `/roles` and
`/permissions`. Every tenant-owned query derives `organizationId` from the validated session.

Default roles are Owner, Admin, Manager, Staff, and Viewer. The centralized permission catalog
contains identity permissions plus the Milestone 3 company, contact, lead, activity, and pipeline
permissions. Default roles are immutable presets; custom roles can be created and updated. See
[CRM Core implementation notes](docs/MILESTONE_3_CRM_CORE.md) for the matrix and API routes.

## CRM Core

CRM records are PostgreSQL-backed and always scoped by the authenticated session's organization.
Companies, contacts, and leads support server-side search, filtering, safe sorting, and pagination.
Lead stage changes, owner changes, activities, and follow-up transitions are recorded
transactionally. `DELETE` endpoints archive records; they do not erase CRM history.

The default pipeline is `Sales Pipeline` with New Lead, Contacted, Qualified, Proposal Sent,
Negotiation, Won, and Lost stages. Business logic uses stage IDs and `isWon`/`isLost` flags rather
than stage names. A won lead does not create a project.

## Repository layout

```text
apps/
  api/          NestJS identity and CRM modules plus Prisma schema
  web/          Next.js App Router frontend
packages/
  config/       Shared strict TypeScript configurations
  types/        Cross-application TypeScript contracts
  ui/           UniCRM design-system components
  validation/   Shared validation package
infrastructure/ Docker and reverse-proxy notes
docs/           Product and architecture blueprint
```

## Milestone boundary

Milestone 3 stops at CRM Core: companies, contacts, leads, the standard sales pipeline, lead
activities, follow-ups, tenant isolation, permissions, and audit history. Projects, tasks,
quotations, payments, dashboard business metrics, reports, automation, AI, SaaS billing, and later
modules remain out of scope.
