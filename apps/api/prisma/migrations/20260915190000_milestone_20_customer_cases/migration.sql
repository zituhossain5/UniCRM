CREATE TYPE "CustomerCaseStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'WAITING_INTERNAL', 'RESOLVED', 'CLOSED');
CREATE TYPE "CustomerCasePriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "CustomerCaseType" AS ENUM ('GENERAL_INQUIRY', 'TECHNICAL_ISSUE', 'SERVICE_REQUEST', 'BILLING', 'COMPLAINT', 'OTHER');

ALTER TYPE "NotificationType" ADD VALUE 'CASE_ASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE 'CASE_DUE';
ALTER TYPE "NotificationType" ADD VALUE 'CASE_REOPENED';
ALTER TYPE "AutomationEntityType" ADD VALUE 'CASE';
ALTER TYPE "AutomationTriggerType" ADD VALUE 'CASE_CREATED';
ALTER TYPE "AutomationTriggerType" ADD VALUE 'CASE_ASSIGNED';
ALTER TYPE "AutomationTriggerType" ADD VALUE 'CASE_STATUS_CHANGED';
ALTER TYPE "AutomationTriggerType" ADD VALUE 'CASE_PRIORITY_CHANGED';
ALTER TYPE "AutomationTriggerType" ADD VALUE 'CASE_RESOLVED';

CREATE TABLE "customer_case_number_counters" (
  "organization_id" UUID NOT NULL,
  "next_number" INTEGER NOT NULL DEFAULT 1,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customer_case_number_counters_pkey" PRIMARY KEY ("organization_id")
);

CREATE TABLE "customer_cases" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "case_number" VARCHAR(32) NOT NULL,
  "title" VARCHAR(220) NOT NULL,
  "description" TEXT,
  "type" "CustomerCaseType" NOT NULL DEFAULT 'GENERAL_INQUIRY',
  "status" "CustomerCaseStatus" NOT NULL DEFAULT 'OPEN',
  "priority" "CustomerCasePriority" NOT NULL DEFAULT 'NORMAL',
  "contact_id" UUID,
  "company_id" UUID,
  "lead_id" UUID,
  "deal_id" UUID,
  "source_thread_id" UUID,
  "assigned_user_id" UUID,
  "due_at" TIMESTAMP(3),
  "resolved_at" TIMESTAMP(3),
  "closed_at" TIMESTAMP(3),
  "created_by_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "archived_at" TIMESTAMP(3),
  CONSTRAINT "customer_cases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_case_comments" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "case_id" UUID NOT NULL,
  "author_user_id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customer_case_comments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "tasks" ADD COLUMN "case_id" UUID;
ALTER TABLE "attachments" ADD COLUMN "case_id" UUID;

CREATE UNIQUE INDEX "customer_cases_organization_id_case_number_key" ON "customer_cases"("organization_id", "case_number");
CREATE INDEX "customer_cases_organization_id_status_priority_updated_at_idx" ON "customer_cases"("organization_id", "status", "priority", "updated_at");
CREATE INDEX "customer_cases_organization_id_assigned_user_id_status_due_at_idx" ON "customer_cases"("organization_id", "assigned_user_id", "status", "due_at");
CREATE INDEX "customer_cases_organization_id_contact_id_archived_at_idx" ON "customer_cases"("organization_id", "contact_id", "archived_at");
CREATE INDEX "customer_cases_organization_id_company_id_archived_at_idx" ON "customer_cases"("organization_id", "company_id", "archived_at");
CREATE INDEX "customer_cases_organization_id_lead_id_archived_at_idx" ON "customer_cases"("organization_id", "lead_id", "archived_at");
CREATE INDEX "customer_cases_organization_id_deal_id_archived_at_idx" ON "customer_cases"("organization_id", "deal_id", "archived_at");
CREATE INDEX "customer_cases_organization_id_source_thread_id_idx" ON "customer_cases"("organization_id", "source_thread_id");
CREATE INDEX "customer_case_comments_organization_id_case_id_created_at_idx" ON "customer_case_comments"("organization_id", "case_id", "created_at");
CREATE INDEX "tasks_organization_id_case_id_archived_at_idx" ON "tasks"("organization_id", "case_id", "archived_at");
CREATE INDEX "attachments_organization_id_case_id_created_at_idx" ON "attachments"("organization_id", "case_id", "created_at");

ALTER TABLE "customer_case_number_counters" ADD CONSTRAINT "customer_case_number_counters_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_cases" ADD CONSTRAINT "customer_cases_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_cases" ADD CONSTRAINT "customer_cases_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "customer_cases" ADD CONSTRAINT "customer_cases_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "customer_cases" ADD CONSTRAINT "customer_cases_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "customer_cases" ADD CONSTRAINT "customer_cases_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "customer_cases" ADD CONSTRAINT "customer_cases_source_thread_id_fkey" FOREIGN KEY ("source_thread_id") REFERENCES "email_threads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "customer_cases" ADD CONSTRAINT "customer_cases_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "customer_cases" ADD CONSTRAINT "customer_cases_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_case_comments" ADD CONSTRAINT "customer_case_comments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_case_comments" ADD CONSTRAINT "customer_case_comments_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "customer_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_case_comments" ADD CONSTRAINT "customer_case_comments_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "customer_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "customer_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "key", "description", "created_at")
SELECT gen_random_uuid(), permission_key, description, CURRENT_TIMESTAMP
FROM (VALUES
  ('case.create', 'Create customer cases'),
  ('case.read', 'View customer cases'),
  ('case.update', 'Update customer cases'),
  ('case.assign', 'Assign customer cases'),
  ('case.resolve', 'Resolve, close, and reopen customer cases'),
  ('case.delete', 'Archive customer cases'),
  ('case.comment', 'Add internal customer case comments')
) AS values_to_insert(permission_key, description)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r CROSS JOIN "permissions" p
WHERE p."key" LIKE 'case.%'
AND (r."name" IN ('Owner', 'Admin', 'Manager') OR
  (r."name" = 'Staff' AND p."key" IN ('case.create', 'case.read', 'case.update', 'case.comment')) OR
  (r."name" = 'Viewer' AND p."key" = 'case.read'))
ON CONFLICT DO NOTHING;
