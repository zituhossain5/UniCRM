# UniCRM

UniCRM is UnicodeIT's internal CRM and project operations platform, structured for a future
multi-tenant SaaS release. Milestones 0-4 provide the monorepo, application shell, first-party
identity and access foundation, CRM core, and project delivery workflows.

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
pipeline, but it never resets or recreates an existing Owner. Run it after each permission-bearing
milestone so organizations created earlier receive the new permission catalog.

For the shortest daily startup, run `pnpm dev:local`; it starts PostgreSQL, Redis, MinIO, and
Mailpit with Docker, then starts the API and web app together. Open `http://localhost:3001/login` and sign in with
`UNICRM_BOOTSTRAP_ADMIN_EMAIL` and `UNICRM_BOOTSTRAP_ADMIN_PASSWORD`.

## Services

| Service         | URL or port                           |
| --------------- | ------------------------------------- |
| Web             | http://localhost:3001                 |
| API             | http://localhost:4000/api/v1          |
| Health endpoint | http://localhost:4000/api/v1/health   |
| PostgreSQL      | localhost:`POSTGRES_PORT`             |
| Redis           | localhost:`REDIS_PORT`                |
| MinIO           | http://localhost:`MINIO_PORT`         |
| MinIO console   | http://localhost:`MINIO_CONSOLE_PORT` |
| Mailpit         | http://localhost:`MAILPIT_HTTP_PORT`  |

## Commands

```bash
pnpm dev                 # Run web and API in watch mode
pnpm dev:local           # Start Docker dependencies, web, and API together
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

Use `docker compose ps` to inspect infrastructure health and `docker compose stop` to stop local
services while preserving data. Named volumes retain data. Use `docker compose down -v` only when
intentionally deleting persisted local PostgreSQL, Redis, and MinIO data for that Compose project.
See [Docker infrastructure](infrastructure/docker/README.md) for the separate production-like
validation workflow.

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

`EMAIL_TRANSPORT=console` is development-only. It stores up to 50 messages in memory and prints each
message, including its invitation/reset URL, in the terminal running `pnpm dev` or `pnpm dev:local`.
The protected development outbox is also available while that API process is running:

```bash
curl -H "X-Dev-Email-Key: <DEV_EMAIL_KEY>" http://localhost:4000/api/v1/dev/emails
```

Normal invitation API responses never contain the raw invitation token. Forgot password always
returns the same response whether an account exists. Invitation and reset tokens are random,
time-limited, single-use, and stored only as hashes. Resending rotates the pending token and expiry;
cancelling removes the unactivated placeholder account and retains a security event.

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
contains identity permissions plus company, contact, lead, project, task, comment, and attachment
permissions, plus quotation and payment permissions. Owner and Admin receive all commercial
permissions. Manager can fully manage quotations and payments. Staff can create/update draft
quotations and read payments, while Viewer is read-only. Default roles are immutable presets; custom roles can be created and updated. See
[CRM Core implementation notes](docs/MILESTONE_3_CRM_CORE.md) for the matrix and API routes.

## CRM Core

CRM records are PostgreSQL-backed and always scoped by the authenticated session's organization.
Companies, contacts, and leads support server-side search, filtering, safe sorting, and pagination.
Lead stage changes, owner changes, activities, and follow-up transitions are recorded
transactionally. `DELETE` endpoints archive records; they do not erase CRM history.

The default pipeline is `Sales Pipeline` with New Lead, Contacted, Qualified, Proposal Sent,
Negotiation, Won, and Lost stages. Business logic uses stage IDs and `isWon`/`isLost` flags rather
than stage names. A won lead does not create a project automatically; an authorized user reviews a
prefilled Project drawer and confirms creation.

## Projects and tasks

Projects belong to one same-organization Company and can optionally link to one won Lead. The
unique source-Lead link prevents accidental duplicate conversion. Project managers, members, and
task assignees must be active users in the same organization. A project manager is also maintained
as a project member. Task assignment deliberately allows any active organization user in V1.

Projects and tasks use archive semantics. Project and task changes write user-facing activity in
the same transaction as the business update. Money uses PostgreSQL `Decimal`, while project and
task schedule fields use date-only columns.

Attachment metadata is stored in PostgreSQL with explicit Project or Task foreign keys. File bytes
are stored by a storage service under `.local/uploads` in development and are never placed in the
database. Uploads are limited to 10 MB and validate authorization, tenant ownership, file names,
allowed types, and recognizable file signatures. `UNICRM_UPLOAD_DIR` may override the local path;
production can replace the storage service with an S3-compatible adapter.

## Quotations and payments

Quotation numbers use an organization-owned counter updated atomically in the same transaction as
the quotation and its items. Numbers are immutable and unique per organization. Quantities,
prices, discounts, taxes, totals, payments, and balances use Prisma/PostgreSQL Decimal values; the
API recalculates every item and total and ignores no client-supplied derived amount.

Draft quotation PDFs are generated on demand with PDFKit. Marking a quotation Sent generates one
immutable PDF snapshot through the existing storage abstraction; later downloads return that
snapshot, so an accepted quotation remains reproducible. The API never exposes its storage key or
filesystem path as a download location. Sent, accepted, rejected, and expired financial content is
not editable.

Project received value is the sum of non-archived payments linked directly to that project. A
payment linked to both a project and quotation is therefore counted once in the project summary;
quotation paid/remaining values use payments linked directly to that quotation. Quotations and
payments are commercial records, not invoices or accounting ledger entries.

## Repository layout

```text
apps/
  api/          NestJS identity, CRM, project delivery modules, and Prisma schema
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

Milestone 5 stops at quotations, quotation PDF snapshots, payments, and project commercial
balances. Invoices, accounting ledgers, payment gateways, business-metric dashboards, advanced
reports, notifications, automation, AI, and SaaS billing remain out of scope.
