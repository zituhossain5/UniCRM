CREATE TYPE "PipelineEntityType" AS ENUM ('LEAD', 'DEAL');

ALTER TYPE "ConfigurableEntityType" ADD VALUE 'DEAL';
ALTER TYPE "SavedViewEntityType" ADD VALUE 'DEAL';
ALTER TYPE "AutomationEntityType" ADD VALUE 'DEAL';
ALTER TYPE "AutomationTriggerType" ADD VALUE 'DEAL_CREATED';
ALTER TYPE "AutomationTriggerType" ADD VALUE 'DEAL_STAGE_CHANGED';
ALTER TYPE "AutomationTriggerType" ADD VALUE 'DEAL_OWNER_CHANGED';
ALTER TYPE "AutomationTriggerType" ADD VALUE 'DEAL_WON';
ALTER TYPE "AutomationTriggerType" ADD VALUE 'DEAL_LOST';

ALTER TABLE "pipelines"
ADD COLUMN "entity_type" "PipelineEntityType" NOT NULL DEFAULT 'LEAD';

DROP INDEX "pipelines_organization_id_name_key";
DROP INDEX "pipelines_one_active_default";
CREATE UNIQUE INDEX "pipelines_organization_id_entity_type_name_key"
ON "pipelines"("organization_id", "entity_type", "name");
CREATE UNIQUE INDEX "pipelines_one_active_default"
ON "pipelines"("organization_id", "entity_type")
WHERE "is_default" = true AND "archived_at" IS NULL;
CREATE INDEX "pipelines_organization_id_entity_type_archived_at_name_idx"
ON "pipelines"("organization_id", "entity_type", "archived_at", "name");

ALTER TABLE "leads" ADD COLUMN "converted_at" TIMESTAMP(3);

CREATE TABLE "deals" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "company_id" UUID NOT NULL,
  "contact_id" UUID,
  "source_lead_id" UUID,
  "owner_id" UUID,
  "pipeline_id" UUID NOT NULL,
  "stage_id" UUID NOT NULL,
  "amount" DECIMAL(19,2),
  "currency" VARCHAR(3) NOT NULL DEFAULT 'BDT',
  "probability" INTEGER NOT NULL DEFAULT 0,
  "expected_close_date" DATE,
  "priority" "LeadPriority" NOT NULL DEFAULT 'MEDIUM',
  "description" TEXT,
  "lost_reason" TEXT,
  "won_at" TIMESTAMP(3),
  "lost_at" TIMESTAMP(3),
  "created_by_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "archived_at" TIMESTAMP(3),
  CONSTRAINT "deals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "deals_probability_check" CHECK ("probability" BETWEEN 0 AND 100),
  CONSTRAINT "deals_amount_check" CHECK ("amount" IS NULL OR "amount" >= 0)
);

CREATE UNIQUE INDEX "deals_source_lead_id_key" ON "deals"("source_lead_id");
CREATE INDEX "deals_organization_id_stage_id_archived_at_idx" ON "deals"("organization_id", "stage_id", "archived_at");
CREATE INDEX "deals_organization_id_owner_id_archived_at_idx" ON "deals"("organization_id", "owner_id", "archived_at");
CREATE INDEX "deals_organization_id_company_id_archived_at_idx" ON "deals"("organization_id", "company_id", "archived_at");
CREATE INDEX "deals_organization_id_expected_close_date_archived_at_idx" ON "deals"("organization_id", "expected_close_date", "archived_at");
CREATE INDEX "deals_organization_id_priority_archived_at_idx" ON "deals"("organization_id", "priority", "archived_at");

ALTER TABLE "projects" ADD COLUMN "source_deal_id" UUID;
CREATE UNIQUE INDEX "projects_source_deal_id_key" ON "projects"("source_deal_id");

ALTER TABLE "quotations" ADD COLUMN "deal_id" UUID;
CREATE INDEX "quotations_organization_id_deal_id_idx" ON "quotations"("organization_id", "deal_id");

ALTER TABLE "deals" ADD CONSTRAINT "deals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deals" ADD CONSTRAINT "deals_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deals" ADD CONSTRAINT "deals_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "deals" ADD CONSTRAINT "deals_source_lead_id_fkey" FOREIGN KEY ("source_lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "deals" ADD CONSTRAINT "deals_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "deals" ADD CONSTRAINT "deals_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deals" ADD CONSTRAINT "deals_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "pipeline_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deals" ADD CONSTRAINT "deals_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "projects" ADD CONSTRAINT "projects_source_deal_id_fkey" FOREIGN KEY ("source_deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "pipelines" ("id", "organization_id", "name", "entity_type", "is_default", "created_at", "updated_at")
SELECT gen_random_uuid(), "id", 'Standard Deal Pipeline', 'DEAL', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "organizations";

INSERT INTO "pipeline_stages" ("id", "organization_id", "pipeline_id", "name", "position", "is_won", "is_lost", "created_at", "updated_at")
SELECT gen_random_uuid(), p."organization_id", p."id", stage."name", stage."position", stage."is_won", stage."is_lost", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "pipelines" p
CROSS JOIN (VALUES
  ('Discovery', 0, false, false),
  ('Qualified', 1, false, false),
  ('Proposal', 2, false, false),
  ('Negotiation', 3, false, false),
  ('Contract', 4, false, false),
  ('Won', 5, true, false),
  ('Lost', 6, false, true)
) AS stage("name", "position", "is_won", "is_lost")
WHERE p."entity_type" = 'DEAL';
