Milestone 19 — Product & Service Catalog

Goal: add a generic organization-scoped catalog of products/services that can be reused in Deals and Quotations.

Do NOT implement ecommerce inventory, stock, shipping, orders, procurement, accounting, subscriptions, or unrelated modules.

Catalog model

Add organization-scoped CatalogItem.

Suggested fields:

id
organizationId
type
name
sku nullable
description nullable
unitPrice Decimal
currency
taxRate nullable
active
createdById
createdAt
updatedAt
archivedAt nullable

Types:

PRODUCT
SERVICE

SKU should be organization-unique when present.

Money must use existing Decimal conventions.

Categories

Add lightweight organization-scoped categories if clean:

CatalogCategory

Examples:

Web Development
Marketing
Consulting
Hardware

Do not build complex nested taxonomy beyond one level in V1.

UI

Add:

Sales
→ Catalog

Route:

/app/catalog

Support:

search
type
category
active/inactive
currency
sort
pagination

Columns:

Name
Type
SKU
Category
Unit Price
Tax
Status

Add create/edit/detail/archive interactions using existing UniCRM UI patterns.

Quotation integration

Extend Quotation line items so users can:

Add from Catalog

Selecting a Catalog Item should prefill:

description
quantity = 1
unit price
tax where applicable

User may adjust quotation quantity/price after selection.

Preserve the Catalog Item reference on the quotation item, but also snapshot:

item name/description
price
tax

so historical quotations do not change when Catalog prices are edited later.

Existing manually entered quotation items must continue working.

Deal integration

Allow Deals to optionally associate expected products/services.

Use a lightweight DealItem model only if needed:

Deal
→ Catalog Items
→ quantity
→ unit price
→ expected line value

Deal amount may be derived or manually controlled according to a clearly documented rule.

Do not silently overwrite existing Deal amounts.

Global Create

Add permission-aware:

New Product / Service

if appropriate without cluttering the global menu.

Import / Export

Extend Milestone 9 Data Management to support Catalog CSV import/export.

Import fields:

name
type
sku
category
description
unit price
currency
tax
active

Preserve tenant isolation and CSV injection protections.

Permissions

Add:

catalog.create
catalog.read
catalog.update
catalog.delete

Suggested:

Owner/Admin → full
Manager → create/read/update
Staff → read, optionally create according to policy
Viewer → read-only

Backend authoritative.

Activity/Audit

Audit meaningful configuration changes:

CATALOG_ITEM_CREATED
CATALOG_ITEM_UPDATED
CATALOG_ITEM_ARCHIVED

Do not create noisy CRM activity for every price edit.

Tenant isolation

Strictly validate:

CatalogItem
CatalogCategory
DealItem
QuotationItem

No cross-organization catalog references.

Tests

Add high-value tests for:

catalog CRUD
Decimal prices
SKU uniqueness
category association
archive/inactive behavior
tenant isolation
RBAC

quotation item from Catalog
quotation snapshot preservation after Catalog price change
manual quotation items remain valid

Deal association
CSV import/export

Preserve all previous tests.

Manual acceptance

Create:

Website Development
Type: Service
SKU: SVC-WEB-001
Unit Price: BDT 150000

UI/UX Design
Type: Service
SKU: SVC-UIUX-001
Unit Price: BDT 80000

Maintenance
Type: Service
SKU: SVC-MAINT-001
Unit Price: BDT 25000

Create a Quotation:

Website Development × 1
UI/UX Design × 1
Maintenance × 3

Expected subtotal:

150000 + 80000 + (25000 × 3)
= BDT 305000

Then change Website Development catalog price to BDT 175000.

Verify the previously created quotation remains:

BDT 150000

while new quotations use:

BDT 175000
Do NOT Implement
inventory
warehouses
stock quantities
purchase orders
suppliers
shipping
ecommerce orders
product variants
accounting ledger
recurring billing
Validation

Run:

pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check

Also verify:

Prisma generate
current migration
fresh migration
Decimal calculations
quotation snapshot behavior
tenant isolation

Stop after Milestone 19.
