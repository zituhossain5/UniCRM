# Milestone 8 — Generic CRM flexibility

Milestone 8 makes UniCRM configurable for different sales and delivery workflows without changing
the core CRM/project/sales scope defined in `UNICRM_BLUEPRINT.md`.

## Custom fields

Organizations can define custom fields for:

- Leads
- Companies
- Contacts
- Projects

Supported field types:

- Text
- Long text
- Number
- Currency
- Date
- Boolean
- Select
- Multi-select
- URL
- Email
- Phone

Custom field definitions are tenant-scoped, ordered per entity type, and may be marked required or
inactive. Stored values are kept in a shared custom-field value table instead of changing the
application schema for each new field.

## Custom field keys

New custom fields use stable normalized keys:

- lowercase
- whitespace and separators become `_`
- unsupported punctuation is removed
- repeated `_` values are collapsed
- leading and trailing `_` values are removed

Examples:

```text
Expected Start Date      -> expected_start_date
Budget Type              -> budget_type
Decision Maker Confirmed -> decision_maker_confirmed
Tax / Registration ID    -> tax_registration_id
Preferred Contact Method -> preferred_contact_method
```

The frontend auto-generates the key from the field name while creating a new field until the user
manually edits the key. Renaming an existing field does not automatically change its stored key,
because saved values, filters, and integrations may depend on that key.

The backend still enforces organization/entity-level key uniqueness and returns a conflict if a key
already exists. UniCRM does not silently append random suffixes.

## Custom field value validation

Custom-field values are submitted through the controlled `customFields` payload object, for example:

```json
{
  "title": "Website redesign",
  "customFields": {
    "budget_type": "Fixed",
    "expected_start_date": "2026-09-20"
  }
}
```

Generated form-control names such as `customField:budget_type` are rejected if they are submitted as
top-level API properties. Strict DTO validation remains enabled.

The backend validates custom-field values against:

- current organization
- entity type
- active custom-field definitions
- required fields
- field type
- select and multi-select options
- cross-tenant references

Lead, company, contact, and project create/update flows persist custom-field values transactionally
with the record update where applicable.

## Saved views

Saved views allow users to persist list configuration for:

- Leads
- Companies
- Contacts
- Projects
- Tasks

Saved views store:

- filters
- sorting
- optional columns where supported
- visibility
- default status

Supported visibility:

- `PRIVATE` — visible only to the creator
- `ORGANIZATION` — visible to authorized users in the same organization

Saved-view definitions are tenant-scoped and validated server-side. Unsupported filters, sort
fields, columns, malformed custom-field filters, and unsafe values are rejected.

## Saved view application

Selecting a saved view restores the saved list configuration rather than only displaying the saved
view name.

For example, a Lead view with:

```text
Tag = Urgent Follow-up
Sort = Estimated Value descending
```

hydrates the tag filter and sort state, sends the corresponding query parameters to the Leads API,
and returns only matching records.

The same shared saved-view application path is used by Leads, Companies, Contacts, Projects, and
Tasks.

## Settings UI

Configuration lives under Settings:

- Settings → Custom Fields

List pages expose saved-view controls near the filters for the configured entity.

## API endpoints

Custom fields:

- `GET /api/v1/custom-fields`
- `POST /api/v1/custom-fields`
- `PATCH /api/v1/custom-fields/:id`
- `POST /api/v1/custom-fields/reorder/:entityType`

Saved views:

- `GET /api/v1/saved-views`
- `POST /api/v1/saved-views`
- `PATCH /api/v1/saved-views/:id`
- `DELETE /api/v1/saved-views/:id`

All routes require authenticated users with the relevant permission.

## Database changes

Milestone 8 adds:

- `CustomFieldDefinition`
- `CustomFieldValue`
- `SavedView`
- supporting entity/visibility/type enums
- custom-field and saved-view permissions

Migration:

```text
apps/api/prisma/migrations/20260906090000_milestone_8_generic_crm_flexibility
```

## Validation

Milestone 8 is covered by API E2E tests for:

- required custom fields
- type validation
- select option validation
- tenant isolation
- custom-field filtering
- key normalization
- canonical `customFields` payload shape
- saved-view private/organization visibility
- saved-view filter and sort restoration

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

- Custom fields are available for Leads, Companies, Contacts, and Projects. Tasks support saved
  views but do not currently have custom-field definitions.
- Saved-view columns are validated and stored where supported, but not every list page exposes a
  full column customization UI yet.
- Custom-field filtering currently matches exact validated values.
