# Milestone 10 — Generic integration platform

## Scope

Milestone 10 adds provider-neutral integration infrastructure. It does not synchronize ecommerce customers or orders and contains no Meta, Shopify, WooCommerce, email/calendar, workflow, AI, or billing integration behavior.

## Connections and secrets

- Connections are organization-scoped and use controlled provider, direction, and status enums.
- A connection accepts a caller-supplied shared secret of at least 32 characters.
- Secrets are encrypted at rest with AES-256-GCM using `INTEGRATION_SECRET_ENCRYPTION_KEY`.
- Production startup requires a canonical base64-encoded 32-byte encryption key.
- Normal API responses and the Settings UI expose only the last four secret characters and rotation timestamp.
- Configuration objects reject credential-like keys and are size limited.
- Authorized users can rotate a connection secret or disable a connection.

Generate a production encryption key outside the repository:

```bash
openssl rand -base64 32
```

Never commit that value or place it in a `NEXT_PUBLIC_*` variable.

## Inbound webhooks

Endpoint:

```text
POST /api/v1/integrations/webhooks/:connectionId
```

Required headers:

```text
X-UniCRM-Event
X-UniCRM-Delivery
X-UniCRM-Timestamp
X-UniCRM-Signature: sha256=<hex HMAC>
```

The signature is `HMAC_SHA256(rawRequestBody, connectionSecret)`. UniCRM uses constant-time comparison, a configurable timestamp tolerance (default five minutes), persistent uniqueness on `connectionId + externalEventId`, a 256 KiB default body limit, strict JSON DTO validation, and Redis-backed rate limiting. Organization identity is resolved from the connection and is never accepted from the payload.

Accepted events are durably persisted and queued. Milestone 10 processing marks a valid generic event processed without changing CRM entities. Sensitive payload keys are redacted, strings and collections are bounded, and raw authentication material is not retained.

## Outbound webhooks

Outbound subscriptions belong to one organization and connection. Target URLs and event types are validated against a controlled event catalog. Production targets require HTTPS and cannot resolve to loopback, link-local, or private network addresses. Redirects are rejected and requests use a configurable timeout.

Supported events:

```text
lead.created
lead.updated
lead.stage_changed
company.created
company.updated
contact.created
contact.updated
project.created
project.updated
task.created
task.updated
task.completed
```

Deliveries include `eventId`, `eventType`, `occurredAt`, and an organization-safe payload. The exact JSON request body is HMAC-signed. HTTP 408, 429, 5xx, timeouts, and network failures are retryable; permanent 4xx failures are recorded without indefinite retry. Response bodies are not stored.

## Queue and retry behavior

The existing `unicrm` BullMQ queue processes inbound integration events and outbound webhook deliveries with five bounded exponential-backoff attempts. A recurring recovery job requeues durable `RECEIVED` events and `PENDING` deliveries after temporary enqueue failures. Authorized users may retry failed records marked retryable from the API or Settings UI.

## External mappings

`ExternalEntityMapping` relates a connection-scoped external type and ID to a controlled UniCRM entity type and UUID. The service validates that the connection and UniCRM entity both belong to the current organization. Database uniqueness prevents duplicate external mappings.

## Permissions

```text
integration.read
integration.manage
integration.logs.read
integration.retry
webhook.manage
```

Owner and Admin receive all five permissions. Manager receives read, log, and retry access. Staff and Viewer receive none by default. Backend permission guards remain authoritative.

## Settings UI

Open:

```text
Settings → Integrations
```

The page provides Connections, Inbound, Outbound, and Logs sections. It displays webhook endpoints, redacted secret state, controlled event selections, delivery results, attempt counts, errors, and authorized retry actions.

## Database migration

```text
apps/api/prisma/migrations/20260907180000_milestone_10_generic_integration_platform
```

The migration creates `IntegrationConnection`, `IntegrationEvent`, `WebhookSubscription`, `WebhookDelivery`, and `ExternalEntityMapping`, their enums, tenant indexes, database uniqueness constraints, foreign keys, permissions, and default system-role grants.

## Validation

```bash
corepack pnpm prisma:generate
corepack pnpm prisma:deploy
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm format:check
```

Production-like validation must additionally provide `VALIDATION_INTEGRATION_SECRET_ENCRYPTION_KEY` and verify the API and worker against PostgreSQL and Redis.

## Known limitations

- Generic inbound processing intentionally performs no provider-specific CRM synchronization.
- Connections use one inbound secret; outbound subscriptions each use their own signing secret.
- Local and private-network webhook targets are allowed only outside production to support development acceptance tests.
- Payload retention is limited and redacted but has no automated age-based deletion policy yet.
- External mappings are managed through the API in this milestone; the Settings UI focuses on connections and webhook operations.
