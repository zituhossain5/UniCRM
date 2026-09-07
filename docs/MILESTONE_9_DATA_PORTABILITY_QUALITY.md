# Milestone 9 — Data portability and quality

Milestone 9 adds basic data-management tooling for import, export, duplicate review, merges, and
bulk updates while preserving UniCRM's tenant isolation and permission model.

## Data Management settings

The Data Management UI lives under:

```text
Settings → Data Management
```

The settings tab is shown to users with data-management permissions. Admin users should normally see
it. Users without the required permissions will not see the tab or will be blocked by the API.

The current UI accepts pasted CSV content. It does not yet provide a file-picker upload button.

## CSV import

Imports are supported for:

- Companies
- Contacts
- Leads

The import flow has two steps:

1. Preview pasted CSV content and review validation issues.
2. Commit the import, which creates a tracked import job.

CSV imports:

- strip a UTF-8 BOM from pasted content
- require a header row
- reject duplicate or unsupported headers
- validate each row before import
- record total, processed, successful, and failed row counts
- keep an error-report CSV on failed or partially failed imports
- are scoped to the current organization

Imports are limited to 2,000 rows per CSV.

## Import headers

Company import:

```csv
name,website,email,phone,status
```

Contact import:

```csv
firstName,lastName,companyId,jobTitle,email,phone,isPrimary
```

Lead import:

```csv
title,firstName,lastName,email,phone,source,priority,companyId,contactId,estimatedValue,currency
```

Example company CSV:

```csv
name,website,email,phone,status
ABC Ltd,https://abc.example.com,hello@abc.example.com,+8801700000000,Prospect
Nova Digital,https://nova.example.com,info@nova.example.com,+8801800000000,Active Client
```

## CSV export

Exports are supported for:

- Companies
- Contacts
- Leads
- Projects
- Tasks

Exports create tracked export jobs and can be downloaded as CSV through the API. Export rows are
tenant-scoped and exclude archived records.

Current export filtering is intentionally conservative: non-empty export filters are rejected with a
clear validation error. Saved export filters should only be enabled after entity-specific filter
contracts are added and tested.

## Duplicate review

Duplicate candidates are supported for:

- Companies
- Contacts
- Leads

Duplicate grouping uses stable record identifiers such as normalized names, email addresses, and
phone numbers depending on the entity type. Results are scoped to the current organization and
exclude archived records.

## Merges

Merge operations are supported for:

- Companies
- Contacts

Company merge:

- reassigns contacts, leads, projects, quotations, and payments from the source company to the
  target company
- archives the source company
- records a merge audit record
- writes an activity log entry

Contact merge:

- reassigns leads and quotations from the source contact to the target contact
- archives the source contact
- preserves primary-contact intent where applicable
- records a merge audit record
- writes an activity log entry

Cross-tenant merges are rejected.

## Bulk updates

Bulk updates are supported for:

- Companies
- Contacts
- Leads
- Projects
- Tasks

Bulk update requests are limited to 500 record IDs. The backend validates that every selected record
belongs to the current organization and is active before applying updates.

Allowed bulk-update fields:

- Companies: `status`, `accountOwnerId`
- Contacts: `companyId`
- Leads: `priority`, `ownerId`, `companyId`
- Projects: `status`, `priority`, `projectManagerId`
- Tasks: `status`, `priority`, `assigneeId`

Unsupported fields are rejected instead of being passed through as arbitrary updates.

## Permissions

Milestone 9 adds dedicated permissions for:

- data import
- data export
- duplicate review
- record merge
- entity-specific bulk updates

The API enforces these permissions on every data-management route.

## API endpoints

Data jobs:

- `GET /api/v1/data-management/jobs`

Imports:

- `POST /api/v1/data-management/imports/preview`
- `POST /api/v1/data-management/imports`

Exports:

- `POST /api/v1/data-management/exports`
- `GET /api/v1/data-management/exports/:id/download`

Duplicates and merges:

- `GET /api/v1/data-management/duplicates?entityType=COMPANY|CONTACT|LEAD`
- `POST /api/v1/data-management/merges`

Bulk updates:

- `POST /api/v1/data-management/bulk-update/companies`
- `POST /api/v1/data-management/bulk-update/contacts`
- `POST /api/v1/data-management/bulk-update/leads`
- `POST /api/v1/data-management/bulk-update/projects`
- `POST /api/v1/data-management/bulk-update/tasks`

## Database changes

Milestone 9 adds:

- `DataImportJob`
- `DataExportJob`
- `DataMergeRecord`
- supporting data import/export/merge/duplicate enums
- data-management and bulk-update permissions

Migration:

```text
apps/api/prisma/migrations/20260907120000_milestone_9_data_portability_quality
```

## Development usage

Start the normal local development services, then run the web/API/worker processes locally as usual.

After signing in as a permitted user:

1. Open Settings.
2. Open Data Management.
3. Choose an entity type.
4. Paste CSV content into the import box.
5. Preview the import.
6. Commit the import if the preview is clean enough.

Exports can be started from the same page and downloaded after the export job completes.

## Validation

Milestone 9 is covered by API E2E tests for:

- CSV preview validation
- CSV import job recording
- CSV export job recording and download
- permission enforcement
- duplicate candidate detection
- bulk update validation
- merge behavior
- tenant isolation

Run the normal quality gate:

```powershell
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm format:check
```

Also run the documented Prisma validation/migration checks before release.

## Known limitations for beta

- The UI currently supports pasted CSV content, not direct file upload.
- Import support is limited to Companies, Contacts, and Leads.
- Export support is available for Companies, Contacts, Leads, Projects, and Tasks.
- Export filters are not enabled yet and are intentionally rejected when non-empty.
- Merge support is limited to Companies and Contacts.
