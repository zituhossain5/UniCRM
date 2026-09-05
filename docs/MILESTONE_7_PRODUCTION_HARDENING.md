# Milestone 7 — Production hardening

Milestone 7 prepares UniCRM for a small internal beta without adding product modules or changing
the CRM/project/sales scope defined in `UNICRM_BLUEPRINT.md`.

## Production runtime defaults

- Production boot fails if `APP_URL` or `CORS_ORIGINS` use plaintext HTTP, wildcard CORS, or
  localhost origins.
- Production boot fails unless `SESSION_COOKIE_SECURE=true`, `LOG_FORMAT=json`,
  `EMAIL_TRANSPORT=smtp`, `EMAIL_DELIVERY_MODE=queue`, and `STORAGE_DRIVER=s3`.
- Request IDs are accepted from `x-request-id` by default or generated server-side, echoed on the
  response, included in request logs, and included in error responses.
- Helmet security headers are enabled. HSTS is enabled only for production because the production
  reverse proxy terminates HTTPS.
- `/api/v1/health/live` reports process liveness. `/api/v1/health/ready` checks PostgreSQL and
  Redis and returns 503 if either dependency is unavailable. `/api/v1/health` remains for existing
  status UI compatibility.

## Jobs and worker

The API process no longer owns recurring notification timers. A separate worker entry point handles:

- `notification-sweep` every 15 minutes
- `auth-maintenance` every hour
- queued `email-delivery` jobs

Run locally when needed:

```powershell
corepack pnpm --filter @unicrm/api worker
```

Production starts the worker with:

```powershell
node apps/api/dist/worker.js
```

Recurring jobs use stable job IDs, and notification creation still uses the database dedupe key from
Milestone 6.

## Storage

Development and tests may use local file storage. Production requires S3-compatible storage:

- `STORAGE_DRIVER=s3`
- `STORAGE_S3_ENDPOINT`
- `STORAGE_S3_BUCKET`
- `STORAGE_S3_ACCESS_KEY_ID`
- `STORAGE_S3_SECRET_ACCESS_KEY`

Attachment downloads remain API-mediated and permission-gated. UniCRM does not expose permanent raw
object URLs.

## Rate limits

Authentication flows continue to use Redis-backed rate limits. Milestone 7 adds authenticated
principal-scoped limits for:

- global search
- attachment uploads

The keys include organization ID and user ID so one tenant cannot throttle another tenant.

## Deployment artifacts

- `apps/api/Dockerfile` builds the API and worker runtime.
- `apps/web/Dockerfile` builds the Next.js runtime.
- `.env.production.example` documents production-only settings and placeholder values.
- `docker-compose.prod.example.yml` provides an internal-beta stack template. Copy both example
  files before deploying and replace every placeholder secret.
- `infrastructure/nginx/unicrm.conf` routes `/api/*` to NestJS and all other paths to Next.js,
  forwards proxy/request headers, redirects HTTP to HTTPS, and sets HSTS.

## Backup, restore, and integrity checks

Scripts:

- `scripts/backup-postgres.ps1`
- `scripts/verify-backup.ps1`
- `scripts/restore-postgres-to-test.ps1`
- `scripts/integrity-checks.sql`

Minimum beta rehearsal:

1. Run `scripts/backup-postgres.ps1` against the source database.
2. Run `scripts/verify-backup.ps1` on the backup artifact.
3. Restore into a non-production database with `scripts/restore-postgres-to-test.ps1`.
4. Run `corepack pnpm --filter @unicrm/api prisma:deploy` against the restored target.
5. Run `scripts/integrity-checks.sql` against the restored target and resolve any returned rows.

## Known limitations for beta

- No WebSockets or push notifications; the frontend still polls notification endpoints.
- No malware scanning for attachments yet. Upload type and signature validation are enforced, and
  production object storage is private.
- No external email/calendar sync.
- No multi-region deployment assumptions.
- No public tenant self-signup.
