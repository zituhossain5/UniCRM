# UniCRM internal beta checklist

## Before deploy

- Confirm `NODE_ENV=production`.
- Confirm `APP_URL` is the final HTTPS origin.
- Confirm `CORS_ORIGINS` contains only the HTTPS web origin.
- Confirm `SESSION_COOKIE_SECURE=true`.
- Confirm `TRUSTED_PROXY_HOPS` matches the reverse proxy chain.
- Confirm `LOG_FORMAT=json`.
- Confirm SMTP credentials with a low-risk test message.
- Confirm `EMAIL_DELIVERY_MODE=queue`.
- Confirm `STORAGE_DRIVER=s3` and the bucket is private.
- Confirm Redis persistence is enabled for queues and rate limits.
- Run `corepack pnpm --filter @unicrm/api prisma:deploy`.
- Run backup verification and restore rehearsal from `MILESTONE_7_PRODUCTION_HARDENING.md`.

## Smoke test

- Sign in and sign out.
- Attempt a state-changing request without CSRF and confirm it fails.
- Invite a user and accept the invitation.
- Disable the invited/accepted user and confirm their sessions are revoked.
- Upload and download an attachment from the same tenant.
- Attempt cross-tenant attachment and quotation PDF access from a second tenant and confirm 404/403.
- Create a task assignment and confirm notification creation.
- Run the worker and confirm recurring notification sweep logs are clean.
- Visit `/api/v1/health/live` and `/api/v1/health/ready`.
- Check production logs include request IDs and do not include raw reset or invitation tokens.

## Rollback posture

- Keep the previous image tag available until beta smoke tests pass.
- Keep the verified database backup from immediately before migration.
- Roll back application images first. Restore the database only if the migration itself must be
  reversed and the product owner accepts data loss since the backup timestamp.
