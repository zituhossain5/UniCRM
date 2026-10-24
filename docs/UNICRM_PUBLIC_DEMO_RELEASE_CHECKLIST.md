# UniCRM Public Demo Release Checklist

## Capability policy

The ordered backend policy is defined by `DEMO_CAPABILITY_MATRIX` and enforced by `DemoSafetyGuard`.

| Area                                                                                                                                       | Classification    | Notes                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- | ------------------------------------------------------------------------------ |
| Tenant-scoped CRM reads                                                                                                                    | ALLOW             | Existing RBAC and tenant predicates remain authoritative.                      |
| CRM writes, tasks, cases, activities, attachments, automations                                                                             | ALLOW_WITH_LIMITS | Mutation rate, per-workspace quotas, file limits, and automation bounds apply. |
| Search, reports, forecast, histories, saved views                                                                                          | ALLOW_WITH_LIMITS | Query rate and demo page-size maximum apply.                                   |
| CRM email, inbox replies, automation email, outbound webhooks                                                                              | SIMULATE          | Normal records/statuses are retained; no external network delivery occurs.     |
| Invitations, role/permission changes, mailbox setup, integrations/webhooks, imports/exports, organization/security changes, password reset | BLOCK             | Direct API attempts return 403.                                                |

## Pre-deploy

- [ ] Use a private `.env.production`; never deploy `.env.production.example` unchanged.
- [ ] Confirm `DATABASE_URL` and `DEMO_POSTGRES_*` target different databases and volumes.
- [ ] Confirm production and demo `REDIS_URL` instances/volumes differ and demo uses `JOB_QUEUE_PREFIX=unicrm-demo`.
- [ ] Confirm demo uses `unicrm_demo_session` / `unicrm_demo_csrf`; production uses `unicrm_session` / `unicrm_csrf`; secure cookies are enabled.
- [ ] Confirm demo MinIO credentials, bucket, and volume differ from production, with `STORAGE_S3_PREFIX=demo`.
- [ ] Set every `DEMO_QUOTA_*`, rate, query, automation, capacity, TTL, and cleanup value for available VPS resources.
- [ ] If Turnstile is enabled, set server-only `DEMO_TURNSTILE_SECRET` and public `NEXT_PUBLIC_DEMO_TURNSTILE_SITE_KEY`; never expose the secret in web build args.
- [ ] Validate `UNICRM_DOMAIN`, TLS certificates, and the external `TRAEFIK_NETWORK`.
- [ ] Confirm the demo `/demo-api/v1` Traefik router priority is above `/api/v1` and its rewrite is `/api/v1` exactly once.

## Build, migrate, and start

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm prisma:generate
docker compose --env-file .env.production -f docker-compose.prod.example.yml build
docker compose --env-file .env.production -f docker-compose.prod.example.yml run --rm api pnpm --filter @unicrm/api prisma:deploy
docker compose --env-file .env.production -f docker-compose.prod.example.yml run --rm demo-api pnpm --filter @unicrm/api prisma:deploy
docker compose --env-file .env.production -f docker-compose.prod.example.yml -f docker-compose.traefik.example.yml up -d
```

Do not run `down -v`; it deletes persisted production and demo volumes. Demo data is disposable, but production backups and restore procedures remain mandatory. Demo data does not replace or enter production backups.

## Operational verification

- [ ] `https://crm.unicodeit.com/api/v1/health/live` and `/ready` return healthy.
- [ ] `https://crm.unicodeit.com/demo-api/v1/health/live` and `/ready` return healthy without internal URLs/secrets.
- [ ] Production and demo API/worker logs show distinct queue prefixes and Redis endpoints/databases.
- [ ] Demo worker schedules cleanup and performs startup cleanup/recovery after restart.
- [ ] Simulated email/webhook log events appear and packet/recipient checks confirm no external delivery.
- [ ] Direct blocked-operation and multi-visitor isolation acceptance checks pass.
- [ ] Quota, request-size, query-size, rate-limit, attachment, short-expiry, restart, and cleanup checks pass.
- [ ] Structured logs contain demo start/rejection/rate/expiry/cleanup/blocked/simulated events without secrets.
- [ ] VPS CPU, memory, disk, PostgreSQL connections, Redis memory, MinIO capacity, and container restart counts remain within private release thresholds.
- [ ] Production backup succeeds before release; demo volumes may be excluded from long-term backups.

## Rollback

1. Remove or disable the public **Explore Live Demo** entry point at the web/edge layer.
2. Stop only `demo-api`, `demo-worker`, `demo-postgres`, `demo-redis`, `demo-minio`, and `demo-storage-init`; leave production services and volumes untouched.
3. Preserve logs for incident review. Do not use `docker compose down -v`.
4. Roll back the application image tag, apply only backward-compatible migration procedures, and re-run both health checks before re-enabling demo traffic.
