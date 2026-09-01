# Milestone 3 CRM Core

This document records implementation details for the product decisions in `UNICRM_BLUEPRINT.md`.
The blueprint remains the source of truth.

## Schema

Milestone 3 adds `Company`, `Contact`, `Pipeline`, `PipelineStage`, `Lead`, `LeadActivity`,
`FollowUp`, and `ActivityLog`. Every record includes `organizationId`. Leads store money as
PostgreSQL `DECIMAL(19,2)` with a separate three-letter currency code. Company, contact, and lead
deletion routes archive records.

`LeadActivity` is the user-facing CRM timeline. `ActivityLog` is the administrative audit trail;
audit metadata contains identifiers and change context, not contact notes or other unnecessary
payloads.

```bash
pnpm prisma:generate
pnpm prisma:deploy
pnpm bootstrap
```

The committed migration is `20260831135125_milestone_3_crm_core`. `pnpm bootstrap` is idempotent
and initializes permissions, default role mappings, and one standard pipeline for both new and
existing organizations.

## Default pipeline

| Position | Stage         | Meaning  |
| -------- | ------------- | -------- |
| 1        | New Lead      | Open     |
| 2        | Contacted     | Open     |
| 3        | Qualified     | Open     |
| 4        | Proposal Sent | Open     |
| 5        | Negotiation   | Open     |
| 6        | Won           | `isWon`  |
| 7        | Lost          | `isLost` |

Stage IDs and flags drive behavior. Moving to Lost requires a reason. Moving to Won never creates
a project in this milestone.

## Permission matrix

| Capability                 | Owner | Admin | Manager | Staff | Viewer |
| -------------------------- | :---: | :---: | :-----: | :---: | :----: |
| Company create/read/update |  Yes  |  Yes  |   Yes   |  Yes  |  Read  |
| Company archive            |  Yes  |  Yes  |   No    |  No   |   No   |
| Contact create/read/update |  Yes  |  Yes  |   Yes   |  Yes  |  Read  |
| Contact archive            |  Yes  |  Yes  |   No    |  No   |   No   |
| Lead create/read/update    |  Yes  |  Yes  |   Yes   |  Yes  |  Read  |
| Lead archive               |  Yes  |  Yes  |   No    |  No   |   No   |
| Lead assign                |  Yes  |  Yes  |   Yes   |  No   |   No   |
| Lead stage update          |  Yes  |  Yes  |   Yes   |  Yes  |   No   |
| Activity/follow-up create  |  Yes  |  Yes  |   Yes   |  Yes  |   No   |
| Activity/follow-up read    |  Yes  |  Yes  |   Yes   |  Yes  |  Yes   |
| Pipeline read              |  Yes  |  Yes  |   Yes   |  Yes  |  Yes   |
| Pipeline manage            |  Yes  |  Yes  |   No    |  No   |   No   |

Backend permission guards are authoritative. Frontend action visibility is only a usability layer.

## API routes

All routes are below `/api/v1` and derive tenant scope from the authenticated session.

```text
GET, POST                 /companies
GET, PATCH, DELETE        /companies/:id
GET, POST                 /contacts
GET, PATCH, DELETE        /contacts/:id
GET, POST                 /leads
GET, PATCH, DELETE        /leads/:id
PATCH                     /leads/:id/stage
PATCH                     /leads/:id/owner
GET, POST                 /leads/:id/activities
POST                      /leads/:id/follow-ups
PATCH                     /leads/:leadId/follow-ups/:id
POST                      /leads/:leadId/follow-ups/:id/complete
POST                      /leads/:leadId/follow-ups/:id/cancel
GET                       /follow-ups
GET                       /pipelines
GET                       /pipelines/:id/stages
```

List endpoints return `{ data, meta: { page, limit, total, totalPages } }`. Sort fields are
whitelisted DTO values. Search and filters execute in PostgreSQL; list relations are loaded in the
same Prisma query to avoid row-by-row lookups.

Follow-up queries accept `scope=today|overdue|upcoming|all`, `mine=true`, and optional `lead`.
Lead fixed views use `view=all|mine|followUpDue|won|lost`.

## Tenant isolation

Controllers never accept an organization ID. Services add the principal's `organizationId` to
every read and write. Related company, contact, owner, pipeline stage, activity, and follow-up IDs
are resolved within that same organization before mutation. Cross-tenant records return a generic
not-found or invalid-relationship error without identifying the foreign tenant.

## Manual verification

1. Run `pnpm prisma:deploy`, then `pnpm bootstrap`, and start the app with `pnpm dev`.
2. Log in as Owner and open `/app/companies`.
3. Create a company, open it, edit its status/details, and verify its audit activity.
4. Open `/app/contacts`, create a contact linked to the company, mark it primary, and edit it.
5. Confirm the company page shows the associated contact.
6. Open `/app/leads` and create one lead without a company.
7. Create another lead with the company/contact, owner, decimal value, source, and priority.
8. Search the lead title and filter by stage, owner, and source.
9. Change sorting and move between pages where enough records exist.
10. Open the lead quick view, then open the full record.
11. Assign and reassign the owner; verify an Owner Change timeline entry.
12. Move through Contacted, Qualified, and Proposal Sent; verify each Stage Change entry.
13. Move to Lost and supply a reason, then move to Won; confirm no project is created.
14. Add Note, Call, Meeting, and Email activities and verify chronological timeline ordering.
15. Schedule a past-due follow-up and verify the Follow-up Due view and overdue query.
16. Reschedule a follow-up, mark one complete, and cancel another; verify timeline entries.
17. Log in as Staff and verify operational create/read/update, stage, activity, and follow-up access.
18. Verify Staff cannot archive records or assign owners.
19. Log in as Viewer and verify CRM pages are read-only.
20. With a second test organization, try its record, user, and stage IDs in first-tenant URLs and
    payloads; verify 404/400 responses and no changes in either tenant.

## Deliberate scope limits

There is one standard pipeline and no pipeline editor. Follow-ups are focused CRM reminders rather
than tasks or workflow automation. There is no automatic project creation, development seed,
custom saved views, global search, dashboard metrics, reporting, email/calendar sync, or later
milestone entity.
