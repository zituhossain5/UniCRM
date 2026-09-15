ALTER TYPE "DataImportEntityType" ADD VALUE IF NOT EXISTS 'CATALOG';
ALTER TYPE "DataExportEntityType" ADD VALUE IF NOT EXISTS 'CATALOG';

DO $$ BEGIN
  CREATE TYPE "CatalogItemType" AS ENUM ('PRODUCT', 'SERVICE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "catalog_categories" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "catalog_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "catalog_items" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "category_id" UUID,
  "type" "CatalogItemType" NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "sku" VARCHAR(80),
  "description" TEXT,
  "unit_price" DECIMAL(19,2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "tax_rate" DECIMAL(9,4),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_by_id" UUID NOT NULL,
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "catalog_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "deal_items" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "deal_id" UUID NOT NULL,
  "catalog_item_id" UUID,
  "item_name" VARCHAR(180) NOT NULL,
  "quantity" DECIMAL(12,4) NOT NULL,
  "unit_price" DECIMAL(19,2) NOT NULL,
  "amount" DECIMAL(19,2) NOT NULL,
  "position" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "deal_items_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "quotation_items"
  ADD COLUMN IF NOT EXISTS "catalog_item_id" UUID,
  ADD COLUMN IF NOT EXISTS "catalog_item_name" VARCHAR(180),
  ADD COLUMN IF NOT EXISTS "catalog_item_description" TEXT,
  ADD COLUMN IF NOT EXISTS "catalog_tax_rate" DECIMAL(9,4);

CREATE UNIQUE INDEX IF NOT EXISTS "catalog_categories_organization_id_name_key" ON "catalog_categories"("organization_id", "name");
CREATE INDEX IF NOT EXISTS "catalog_categories_organization_id_active_name_idx" ON "catalog_categories"("organization_id", "active", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "catalog_items_organization_id_sku_key" ON "catalog_items"("organization_id", "sku");
CREATE INDEX IF NOT EXISTS "catalog_items_organization_id_archived_at_active_name_idx" ON "catalog_items"("organization_id", "archived_at", "active", "name");
CREATE INDEX IF NOT EXISTS "catalog_items_organization_id_type_category_id_idx" ON "catalog_items"("organization_id", "type", "category_id");
CREATE UNIQUE INDEX IF NOT EXISTS "deal_items_deal_id_position_key" ON "deal_items"("deal_id", "position");
CREATE INDEX IF NOT EXISTS "deal_items_organization_id_deal_id_idx" ON "deal_items"("organization_id", "deal_id");
CREATE INDEX IF NOT EXISTS "deal_items_organization_id_catalog_item_id_idx" ON "deal_items"("organization_id", "catalog_item_id");
CREATE INDEX IF NOT EXISTS "quotation_items_organization_id_catalog_item_id_idx" ON "quotation_items"("organization_id", "catalog_item_id");

DO $$ BEGIN ALTER TABLE "catalog_categories" ADD CONSTRAINT "catalog_categories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "catalog_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "deal_items" ADD CONSTRAINT "deal_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "deal_items" ADD CONSTRAINT "deal_items_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "deal_items" ADD CONSTRAINT "deal_items_catalog_item_id_fkey" FOREIGN KEY ("catalog_item_id") REFERENCES "catalog_items"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_catalog_item_id_fkey" FOREIGN KEY ("catalog_item_id") REFERENCES "catalog_items"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO "permissions" ("id", "key", "description", "created_at") VALUES
  ('a1900000-0000-4000-8000-000000000001', 'catalog.create', 'Create catalog products and services', CURRENT_TIMESTAMP),
  ('a1900000-0000-4000-8000-000000000002', 'catalog.read', 'View the product and service catalog', CURRENT_TIMESTAMP),
  ('a1900000-0000-4000-8000-000000000003', 'catalog.update', 'Update catalog products and services', CURRENT_TIMESTAMP),
  ('a1900000-0000-4000-8000-000000000004', 'catalog.delete', 'Archive catalog products and services', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

WITH default_grants("role_name", "permission_key") AS (
  VALUES
    ('Owner', 'catalog.create'), ('Owner', 'catalog.read'), ('Owner', 'catalog.update'), ('Owner', 'catalog.delete'),
    ('Admin', 'catalog.create'), ('Admin', 'catalog.read'), ('Admin', 'catalog.update'), ('Admin', 'catalog.delete'),
    ('Manager', 'catalog.create'), ('Manager', 'catalog.read'), ('Manager', 'catalog.update'),
    ('Staff', 'catalog.read'),
    ('Viewer', 'catalog.read')
)
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT roles."id", permissions."id"
FROM default_grants
JOIN "roles" AS roles ON roles."name" = default_grants."role_name" AND roles."is_system" = true
JOIN "permissions" AS permissions ON permissions."key" = default_grants."permission_key"
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
