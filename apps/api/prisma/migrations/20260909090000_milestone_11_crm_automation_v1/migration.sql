CREATE TYPE "AutomationEntityType" AS ENUM ('LEAD', 'PROJECT', 'TASK', 'QUOTATION', 'PAYMENT');
ALTER TYPE "NotificationType" ADD VALUE 'AUTOMATION';
CREATE TYPE "AutomationTriggerType" AS ENUM (
  'LEAD_CREATED', 'LEAD_STAGE_CHANGED', 'LEAD_OWNER_CHANGED',
  'PROJECT_CREATED', 'PROJECT_STATUS_CHANGED',
  'TASK_CREATED', 'TASK_STATUS_CHANGED', 'TASK_OVERDUE',
  'QUOTATION_CREATED', 'QUOTATION_STATUS_CHANGED', 'PAYMENT_CREATED'
);
CREATE TYPE "AutomationRunStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'SKIPPED', 'FAILED');

CREATE TABLE "automation_rules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "entity_type" "AutomationEntityType" NOT NULL,
  "trigger_type" "AutomationTriggerType" NOT NULL,
  "trigger_config" JSONB,
  "conditions" JSONB NOT NULL,
  "actions" JSONB NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_by_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "automation_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "automation_rule_id" UUID NOT NULL,
  "trigger_event_id" VARCHAR(220) NOT NULL,
  "entity_type" "AutomationEntityType" NOT NULL,
  "entity_id" UUID NOT NULL,
  "status" "AutomationRunStatus" NOT NULL DEFAULT 'PENDING',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "depth" INTEGER NOT NULL DEFAULT 0,
  "retryable" BOOLEAN NOT NULL DEFAULT true,
  "trigger_payload" JSONB NOT NULL,
  "action_results" JSONB,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "error_summary" VARCHAR(1000),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "automation_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "automation_rules_organization_id_name_key" ON "automation_rules"("organization_id", "name");
CREATE INDEX "automation_rules_organization_id_entity_type_trigger_type_active_idx" ON "automation_rules"("organization_id", "entity_type", "trigger_type", "active");
CREATE UNIQUE INDEX "automation_runs_automation_rule_id_trigger_event_id_key" ON "automation_runs"("automation_rule_id", "trigger_event_id");
CREATE INDEX "automation_runs_organization_id_status_created_at_idx" ON "automation_runs"("organization_id", "status", "created_at");
CREATE INDEX "automation_runs_organization_id_entity_type_entity_id_created_at_idx" ON "automation_runs"("organization_id", "entity_type", "entity_id", "created_at");

ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_automation_rule_id_fkey" FOREIGN KEY ("automation_rule_id") REFERENCES "automation_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "key", "description", "created_at") VALUES
  ('b0000000-0000-4000-8000-000000000001', 'automation.read', 'View automation rules', CURRENT_TIMESTAMP),
  ('b0000000-0000-4000-8000-000000000002', 'automation.manage', 'Create and manage automation rules', CURRENT_TIMESTAMP),
  ('b0000000-0000-4000-8000-000000000003', 'automation.runs.read', 'View automation run history', CURRENT_TIMESTAMP),
  ('b0000000-0000-4000-8000-000000000004', 'automation.retry', 'Retry eligible failed automation runs', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";

WITH default_grants("role_name", "permission_key") AS (
  VALUES
    ('Owner', 'automation.read'), ('Owner', 'automation.manage'), ('Owner', 'automation.runs.read'), ('Owner', 'automation.retry'),
    ('Admin', 'automation.read'), ('Admin', 'automation.manage'), ('Admin', 'automation.runs.read'), ('Admin', 'automation.retry'),
    ('Manager', 'automation.read'), ('Manager', 'automation.runs.read')
)
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT roles."id", permissions."id"
FROM default_grants
JOIN "roles" AS roles ON roles."name" = default_grants."role_name" AND roles."is_system" = true
JOIN "permissions" AS permissions ON permissions."key" = default_grants."permission_key"
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
