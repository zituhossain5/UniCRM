CREATE TYPE "DataImportEntityType" AS ENUM ('COMPANY', 'CONTACT', 'LEAD');
CREATE TYPE "DataExportEntityType" AS ENUM ('COMPANY', 'CONTACT', 'LEAD', 'PROJECT', 'TASK');
CREATE TYPE "DataJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED');
CREATE TYPE "DuplicateEntityType" AS ENUM ('COMPANY', 'CONTACT', 'LEAD');
CREATE TYPE "MergeEntityType" AS ENUM ('COMPANY', 'CONTACT');

CREATE TABLE "data_import_jobs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "entity_type" "DataImportEntityType" NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "status" "DataJobStatus" NOT NULL DEFAULT 'PENDING',
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "processed_rows" INTEGER NOT NULL DEFAULT 0,
    "success_rows" INTEGER NOT NULL DEFAULT 0,
    "failed_rows" INTEGER NOT NULL DEFAULT 0,
    "error_report_csv" TEXT,
    "metadata" JSONB,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    CONSTRAINT "data_import_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "data_export_jobs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "entity_type" "DataExportEntityType" NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "status" "DataJobStatus" NOT NULL DEFAULT 'PENDING',
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "size_bytes" INTEGER NOT NULL DEFAULT 0,
    "filters" JSONB,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    CONSTRAINT "data_export_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "data_merge_records" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "entity_type" "MergeEntityType" NOT NULL,
    "source_id" UUID NOT NULL,
    "target_id" UUID NOT NULL,
    "metadata" JSONB,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "data_merge_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "data_import_jobs_organization_id_entity_type_created_at_idx" ON "data_import_jobs"("organization_id", "entity_type", "created_at");
CREATE INDEX "data_import_jobs_organization_id_status_created_at_idx" ON "data_import_jobs"("organization_id", "status", "created_at");
CREATE INDEX "data_export_jobs_organization_id_entity_type_created_at_idx" ON "data_export_jobs"("organization_id", "entity_type", "created_at");
CREATE INDEX "data_export_jobs_organization_id_status_created_at_idx" ON "data_export_jobs"("organization_id", "status", "created_at");
CREATE INDEX "data_merge_records_organization_id_entity_type_created_at_idx" ON "data_merge_records"("organization_id", "entity_type", "created_at");
CREATE INDEX "data_merge_records_organization_id_source_id_idx" ON "data_merge_records"("organization_id", "source_id");
CREATE INDEX "data_merge_records_organization_id_target_id_idx" ON "data_merge_records"("organization_id", "target_id");

ALTER TABLE "data_import_jobs" ADD CONSTRAINT "data_import_jobs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "data_import_jobs" ADD CONSTRAINT "data_import_jobs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "data_export_jobs" ADD CONSTRAINT "data_export_jobs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "data_export_jobs" ADD CONSTRAINT "data_export_jobs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "data_merge_records" ADD CONSTRAINT "data_merge_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "data_merge_records" ADD CONSTRAINT "data_merge_records_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "key", "description", "created_at") VALUES
  ('90000000-0000-4000-8000-000000000001', 'data.import', 'Import CRM records from reviewed CSV files', CURRENT_TIMESTAMP),
  ('90000000-0000-4000-8000-000000000002', 'data.export', 'Export permitted CRM records to CSV', CURRENT_TIMESTAMP),
  ('90000000-0000-4000-8000-000000000003', 'data.duplicates.read', 'Review possible duplicate CRM records', CURRENT_TIMESTAMP),
  ('90000000-0000-4000-8000-000000000004', 'data.merge', 'Merge duplicate company and contact records', CURRENT_TIMESTAMP),
  ('90000000-0000-4000-8000-000000000005', 'lead.bulk_update', 'Bulk update leads', CURRENT_TIMESTAMP),
  ('90000000-0000-4000-8000-000000000006', 'company.bulk_update', 'Bulk update companies', CURRENT_TIMESTAMP),
  ('90000000-0000-4000-8000-000000000007', 'contact.bulk_update', 'Bulk update contacts', CURRENT_TIMESTAMP),
  ('90000000-0000-4000-8000-000000000008', 'project.bulk_update', 'Bulk update projects', CURRENT_TIMESTAMP),
  ('90000000-0000-4000-8000-000000000009', 'task.bulk_update', 'Bulk update tasks', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";

WITH default_grants("role_name", "permission_key") AS (
  VALUES
    ('Owner', 'data.import'), ('Owner', 'data.export'), ('Owner', 'data.duplicates.read'), ('Owner', 'data.merge'),
    ('Owner', 'lead.bulk_update'), ('Owner', 'company.bulk_update'), ('Owner', 'contact.bulk_update'), ('Owner', 'project.bulk_update'), ('Owner', 'task.bulk_update'),
    ('Admin', 'data.import'), ('Admin', 'data.export'), ('Admin', 'data.duplicates.read'), ('Admin', 'data.merge'),
    ('Admin', 'lead.bulk_update'), ('Admin', 'company.bulk_update'), ('Admin', 'contact.bulk_update'), ('Admin', 'project.bulk_update'), ('Admin', 'task.bulk_update'),
    ('Manager', 'data.import'), ('Manager', 'data.export'), ('Manager', 'data.duplicates.read'), ('Manager', 'data.merge'),
    ('Manager', 'lead.bulk_update'), ('Manager', 'company.bulk_update'), ('Manager', 'contact.bulk_update'), ('Manager', 'project.bulk_update'), ('Manager', 'task.bulk_update'),
    ('Staff', 'data.export'), ('Staff', 'lead.bulk_update'), ('Staff', 'company.bulk_update'), ('Staff', 'contact.bulk_update'), ('Staff', 'project.bulk_update'), ('Staff', 'task.bulk_update')
)
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT roles."id", permissions."id"
FROM default_grants
JOIN "roles" AS roles ON roles."name" = default_grants."role_name" AND roles."is_system" = true
JOIN "permissions" AS permissions ON permissions."key" = default_grants."permission_key"
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
