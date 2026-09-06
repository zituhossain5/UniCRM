CREATE TYPE "ConfigurableEntityType" AS ENUM ('LEAD', 'COMPANY', 'CONTACT', 'PROJECT');
CREATE TYPE "CustomFieldType" AS ENUM ('TEXT', 'LONG_TEXT', 'NUMBER', 'CURRENCY', 'DATE', 'BOOLEAN', 'SELECT', 'MULTI_SELECT', 'URL', 'EMAIL', 'PHONE');
CREATE TYPE "SavedViewEntityType" AS ENUM ('LEAD', 'COMPANY', 'CONTACT', 'PROJECT', 'TASK');
CREATE TYPE "SavedViewVisibility" AS ENUM ('PRIVATE', 'ORGANIZATION');

ALTER TABLE "organizations"
ADD COLUMN "default_currency" VARCHAR(3) NOT NULL DEFAULT 'BDT';

ALTER TABLE "pipelines"
ADD COLUMN "archived_at" TIMESTAMP(3);

WITH ranked_defaults AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "organization_id"
    ORDER BY "created_at", "id"
  ) AS position
  FROM "pipelines"
  WHERE "is_default" = true
)
UPDATE "pipelines"
SET "is_default" = false
FROM ranked_defaults
WHERE "pipelines"."id" = ranked_defaults."id"
  AND ranked_defaults.position > 1;

DROP INDEX IF EXISTS "pipelines_organization_id_is_default_idx";
CREATE UNIQUE INDEX "pipelines_one_active_default"
ON "pipelines"("organization_id")
WHERE "is_default" = true AND "archived_at" IS NULL;
CREATE INDEX "pipelines_organization_id_archived_at_name_idx"
ON "pipelines"("organization_id", "archived_at", "name");

CREATE TABLE "custom_field_definitions" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "entity_type" "ConfigurableEntityType" NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "key" VARCHAR(80) NOT NULL,
  "field_type" "CustomFieldType" NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT false,
  "position" INTEGER NOT NULL,
  "options" JSONB,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "custom_field_definitions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "custom_field_values" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "field_definition_id" UUID NOT NULL,
  "entity_type" "ConfigurableEntityType" NOT NULL,
  "entity_id" UUID NOT NULL,
  "value" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "custom_field_values_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tags" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "normalized_name" VARCHAR(80) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "entity_tags" (
  "organization_id" UUID NOT NULL,
  "tag_id" UUID NOT NULL,
  "entity_type" "ConfigurableEntityType" NOT NULL,
  "entity_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "entity_tags_pkey" PRIMARY KEY ("tag_id", "entity_type", "entity_id")
);

CREATE TABLE "saved_views" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "user_id" UUID,
  "entity_type" "SavedViewEntityType" NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "filters" JSONB NOT NULL,
  "sort" JSONB,
  "columns" JSONB,
  "visibility" "SavedViewVisibility" NOT NULL DEFAULT 'PRIVATE',
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "saved_views_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "custom_field_definitions_organization_id_entity_type_key_key"
ON "custom_field_definitions"("organization_id", "entity_type", "key");
CREATE UNIQUE INDEX "custom_field_definitions_organization_id_entity_type_position_key"
ON "custom_field_definitions"("organization_id", "entity_type", "position");
CREATE INDEX "custom_field_definitions_organization_id_entity_type_active_position_idx"
ON "custom_field_definitions"("organization_id", "entity_type", "active", "position");

CREATE UNIQUE INDEX "custom_field_values_field_definition_id_entity_id_key"
ON "custom_field_values"("field_definition_id", "entity_id");
CREATE INDEX "custom_field_values_organization_id_entity_type_entity_id_idx"
ON "custom_field_values"("organization_id", "entity_type", "entity_id");
CREATE INDEX "custom_field_values_organization_id_field_definition_id_idx"
ON "custom_field_values"("organization_id", "field_definition_id");

CREATE UNIQUE INDEX "tags_organization_id_normalized_name_key"
ON "tags"("organization_id", "normalized_name");
CREATE INDEX "tags_organization_id_name_idx" ON "tags"("organization_id", "name");
CREATE INDEX "entity_tags_organization_id_entity_type_entity_id_idx"
ON "entity_tags"("organization_id", "entity_type", "entity_id");
CREATE INDEX "entity_tags_organization_id_tag_id_entity_type_idx"
ON "entity_tags"("organization_id", "tag_id", "entity_type");

CREATE INDEX "saved_views_organization_id_entity_type_visibility_idx"
ON "saved_views"("organization_id", "entity_type", "visibility");
CREATE INDEX "saved_views_user_id_entity_type_is_default_idx"
ON "saved_views"("user_id", "entity_type", "is_default");

ALTER TABLE "custom_field_definitions"
ADD CONSTRAINT "custom_field_definitions_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "custom_field_values"
ADD CONSTRAINT "custom_field_values_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "custom_field_values"
ADD CONSTRAINT "custom_field_values_field_definition_id_fkey"
FOREIGN KEY ("field_definition_id") REFERENCES "custom_field_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tags"
ADD CONSTRAINT "tags_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "entity_tags"
ADD CONSTRAINT "entity_tags_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "entity_tags"
ADD CONSTRAINT "entity_tags_tag_id_fkey"
FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "saved_views"
ADD CONSTRAINT "saved_views_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "saved_views"
ADD CONSTRAINT "saved_views_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "custom_field_definitions"
ADD CONSTRAINT "custom_field_definitions_position_check" CHECK ("position" >= 0);
ALTER TABLE "custom_field_definitions"
ADD CONSTRAINT "custom_field_definitions_key_check" CHECK ("key" ~ '^[a-z][a-z0-9_]{0,79}$');
ALTER TABLE "organizations"
ADD CONSTRAINT "organizations_default_currency_check" CHECK ("default_currency" ~ '^[A-Z]{3}$');

INSERT INTO "permissions" ("id", "key", "description", "created_at") VALUES
  ('80000000-0000-4000-8000-000000000001', 'custom_field.read', 'View custom field definitions and values', CURRENT_TIMESTAMP),
  ('80000000-0000-4000-8000-000000000002', 'custom_field.manage', 'Manage custom field definitions', CURRENT_TIMESTAMP),
  ('80000000-0000-4000-8000-000000000003', 'tag.read', 'View and assign organization tags', CURRENT_TIMESTAMP),
  ('80000000-0000-4000-8000-000000000004', 'tag.manage', 'Create, rename, and delete organization tags', CURRENT_TIMESTAMP),
  ('80000000-0000-4000-8000-000000000005', 'saved_view.create', 'Create saved list views', CURRENT_TIMESTAMP),
  ('80000000-0000-4000-8000-000000000006', 'saved_view.read', 'View permitted saved list views', CURRENT_TIMESTAMP),
  ('80000000-0000-4000-8000-000000000007', 'saved_view.update', 'Update permitted saved list views', CURRENT_TIMESTAMP),
  ('80000000-0000-4000-8000-000000000008', 'saved_view.delete', 'Delete permitted saved list views', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";

WITH default_grants("role_name", "permission_key") AS (
  VALUES
    ('Owner', 'custom_field.read'), ('Owner', 'custom_field.manage'), ('Owner', 'tag.read'), ('Owner', 'tag.manage'),
    ('Owner', 'saved_view.create'), ('Owner', 'saved_view.read'), ('Owner', 'saved_view.update'), ('Owner', 'saved_view.delete'),
    ('Admin', 'custom_field.read'), ('Admin', 'custom_field.manage'), ('Admin', 'tag.read'), ('Admin', 'tag.manage'),
    ('Admin', 'saved_view.create'), ('Admin', 'saved_view.read'), ('Admin', 'saved_view.update'), ('Admin', 'saved_view.delete'),
    ('Manager', 'custom_field.read'), ('Manager', 'tag.read'), ('Manager', 'saved_view.create'), ('Manager', 'saved_view.read'),
    ('Manager', 'saved_view.update'), ('Manager', 'saved_view.delete'),
    ('Staff', 'custom_field.read'), ('Staff', 'tag.read'), ('Staff', 'saved_view.create'), ('Staff', 'saved_view.read'),
    ('Staff', 'saved_view.update'), ('Staff', 'saved_view.delete'),
    ('Viewer', 'custom_field.read'), ('Viewer', 'tag.read'), ('Viewer', 'saved_view.read')
)
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT roles."id", permissions."id"
FROM default_grants
JOIN "roles" AS roles ON roles."name" = default_grants."role_name" AND roles."is_system" = true
JOIN "permissions" AS permissions ON permissions."key" = default_grants."permission_key"
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
