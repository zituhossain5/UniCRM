# Milestone 11 — CRM Automation V1

## Scope

Milestone 11 adds organization-scoped, event-driven CRM automations. Rules use a fixed trigger,
condition, and action catalog; no arbitrary query language, JavaScript, or unrestricted HTTP
request can be stored or executed.

Open the management UI at:

```text
Settings → Automations
```

## Execution flow

```text
application/domain event
→ matching active rules
→ durable AutomationRun (unique rule + trigger event)
→ automation-execution job on the existing unicrm BullMQ queue
→ snapshot condition validation
→ controlled actions
→ safe action results and final run status
```

The API and worker use the existing `REDIS_URL`, `JOB_QUEUE_PREFIX`, and `unicrm` queue. The worker
schedules `automation-recovery` every minute and also recovers pending runs at startup. Queue jobs
use three bounded attempts with exponential backoff. Business and validation failures are recorded
without retry; transient infrastructure failures are eligible for bounded retry.

## Supported triggers

- `lead.created`, `lead.stage_changed`, `lead.owner_changed`
- `project.created`, `project.status_changed`
- `task.created`, `task.status_changed`, `task.overdue`
- `quotation.created`, `quotation.status_changed`
- `payment.created`

Triggers are emitted by application services after successful business transactions. They are not
derived from raw database changes. Overdue tasks and expired quotations use deterministic event IDs
so repeated scheduled sweeps do not duplicate runs.

## Conditions and actions

Conditions use approved entity fields and the operators equals, not equals, contains, greater than,
less than, is empty, and is not empty. Organization-owned users, tags, pipeline stages, pipelines,
and custom-field definitions are validated when a rule is saved. Custom-field types and select
options are validated server-side.

Actions are limited to task creation, follow-up creation, tag add/remove, owner assignment, priority
change, in-app notification, and an existing configured outbound webhook subscription. Notifications,
tag changes, and outbound delivery creation use stable uniqueness keys where available.

## Safety and auditability

- `AutomationRun` is unique by automation rule and trigger event ID.
- Nested automation events carry execution depth; depth five is the hard maximum.
- Rule/entity snapshots and all referenced records are organization-scoped.
- Run history records attempts, timestamps, safe error summaries, and completed action summaries.
- Secrets, response bodies, and stack traces are not stored in automation runs.
- Disabled rules do not create runs.

## Permissions

```text
automation.read
automation.manage
automation.runs.read
automation.retry
```

Owner and Admin receive all permissions. Manager receives rule and run visibility. Staff and Viewer
receive no automation permissions by default.

## Database migration

```text
apps/api/prisma/migrations/20260909090000_milestone_11_crm_automation_v1
```

The migration creates `AutomationRule`, `AutomationRun`, controlled enums, tenant indexes,
duplicate-run protection, foreign keys, permissions, and default role grants.

## Local worker and validation

Run the worker locally with:

```bash
corepack pnpm --filter @unicrm/api worker
```

Validate with:

```bash
corepack pnpm prisma:generate
corepack pnpm prisma:deploy
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm format:check
```
