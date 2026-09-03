# Milestone 6 — Operational workspace

## Definitions

- Open leads: non-archived leads whose pipeline stage is neither won nor lost. Managers see the organization; non-managers see owned leads.
- Active projects: non-archived projects in `IN_PROGRESS` or `IN_REVIEW`.
- Due today and overdue tasks: incomplete, non-archived tasks classified against UTC date-only boundaries. Non-managers see assigned tasks.
- Upcoming follow-ups: pending follow-ups due before the end of the next seven UTC dates. Non-managers see assigned follow-ups.
- Outstanding: project value minus non-archived project payments, calculated with Prisma `Decimal` and returned per currency.
- Lead conversion: won / (won + lost). The result is null when there are no closed leads.

`Project.startDate`, `Project.deadline`, `Task.startDate`, `Task.dueDate`, and payment dates are PostgreSQL `date` values represented at UTC midnight. Timestamped follow-ups retain their instant semantics. Organizations now have a timezone field defaulting to `UTC`; V1 intentionally uses the date-only UTC strategy until organization-local scheduling is exposed in settings.

## APIs

- Dashboard: `/api/v1/dashboard/summary`, `/my-tasks`, `/follow-ups`, `/recent-activity`
- Reports: lead pipeline/conversion/source, project/task status, overdue tasks, payments, and outstanding balances under `/api/v1/reports`
- Notifications: list, unread count, mark read, and mark all read under `/api/v1/notifications`
- Search: bounded grouped results at `/api/v1/search?q=...&limit=5`

Search uses PostgreSQL case-insensitive `contains` queries over deliberately limited fields and returns at most ten items per group. Existing tenant-prefixed indexes support scoping; V1 does not add trigram/full-text infrastructure because expected datasets are small and substring search has not demonstrated a performance problem.

## Notifications

Application services create notifications for task assignments, accepted quotations, and recorded payments. A 15-minute in-process recurring sweep generates due-soon/overdue task, follow-up, and project-deadline notifications. A database unique key makes all generation idempotent. This deliberately avoids WebSockets and a separate worker; polling refreshes the bell every minute.

## Manual acceptance

1. Compare dashboard lead/project/task/follow-up counts with their filtered list pages and compare outstanding totals with project financial summaries.
2. Open each report and cross-check representative records. For payments, exercise the date range and verify per-currency totals.
3. Assign a task to a second user, sign in as that user, open the unread bell item, and verify the task quick view opens. Exercise mark-read and mark-all-read.
4. Press Ctrl/Cmd+K and search a company name, project term, task title, and quotation number. Confirm grouped navigation and that create commands remain available.
5. Sign in with a restricted custom role and a user in another tenant to confirm aggregates, report endpoints, notifications, and search never expose unauthorized records.

## Known V1 limits

- Scheduled notification sweeps run inside each API process rather than BullMQ. Database idempotency keeps multiple API instances safe, but a continuously running API is required.
- Report filters are intentionally limited; the UI exposes the payments date range while the API also supports relevant owner, assignee, company, and project filters.
- No chart dependency was added. Exact-value tables are the primary report presentation.
