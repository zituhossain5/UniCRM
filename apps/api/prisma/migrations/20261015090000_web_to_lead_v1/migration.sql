CREATE TYPE "WebToLeadSubmissionStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'ACCEPTED', 'FAILED');

CREATE TABLE "web_to_lead_integrations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "source_key" VARCHAR(80) NOT NULL,
    "default_pipeline_id" UUID NOT NULL,
    "default_stage_id" UUID NOT NULL,
    "default_owner_id" UUID,
    "default_priority" "LeadPriority" NOT NULL DEFAULT 'MEDIUM',
    "default_tag_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
    "mappings" JSONB NOT NULL,
    "last_submission_at" TIMESTAMP(3),
    "successful_submissions" INTEGER NOT NULL DEFAULT 0,
    "failed_submissions" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "web_to_lead_integrations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "web_to_lead_submissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "integration_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "lead_id" UUID,
    "idempotency_key" VARCHAR(160) NOT NULL,
    "request_digest" CHAR(64) NOT NULL,
    "submission_id" VARCHAR(160),
    "status" "WebToLeadSubmissionStatus" NOT NULL DEFAULT 'RECEIVED',
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "last_error" VARCHAR(1000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "web_to_lead_submissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "web_to_lead_integrations_connection_id_key" ON "web_to_lead_integrations"("connection_id");
CREATE UNIQUE INDEX "web_to_lead_integrations_organization_id_source_key_key" ON "web_to_lead_integrations"("organization_id", "source_key");
CREATE INDEX "web_to_lead_integrations_organization_id_created_at_idx" ON "web_to_lead_integrations"("organization_id", "created_at");
CREATE INDEX "web_to_lead_integrations_org_pipeline_stage_idx" ON "web_to_lead_integrations"("organization_id", "default_pipeline_id", "default_stage_id");

CREATE UNIQUE INDEX "web_to_lead_submissions_event_id_key" ON "web_to_lead_submissions"("event_id");
CREATE UNIQUE INDEX "web_to_lead_submissions_integration_id_idempotency_key_key" ON "web_to_lead_submissions"("integration_id", "idempotency_key");
CREATE UNIQUE INDEX "web_to_lead_submissions_integration_id_submission_id_key" ON "web_to_lead_submissions"("integration_id", "submission_id");
CREATE INDEX "web_to_lead_submissions_organization_id_status_created_at_idx" ON "web_to_lead_submissions"("organization_id", "status", "created_at");
CREATE INDEX "web_to_lead_submissions_organization_id_lead_id_idx" ON "web_to_lead_submissions"("organization_id", "lead_id");

ALTER TABLE "web_to_lead_integrations" ADD CONSTRAINT "web_to_lead_integrations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "web_to_lead_integrations" ADD CONSTRAINT "web_to_lead_integrations_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "integration_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "web_to_lead_integrations" ADD CONSTRAINT "web_to_lead_integrations_default_pipeline_id_fkey" FOREIGN KEY ("default_pipeline_id") REFERENCES "pipelines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "web_to_lead_integrations" ADD CONSTRAINT "web_to_lead_integrations_default_stage_id_fkey" FOREIGN KEY ("default_stage_id") REFERENCES "pipeline_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "web_to_lead_integrations" ADD CONSTRAINT "web_to_lead_integrations_default_owner_id_fkey" FOREIGN KEY ("default_owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "web_to_lead_integrations" ADD CONSTRAINT "web_to_lead_integrations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "web_to_lead_submissions" ADD CONSTRAINT "web_to_lead_submissions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "web_to_lead_submissions" ADD CONSTRAINT "web_to_lead_submissions_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "web_to_lead_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "web_to_lead_submissions" ADD CONSTRAINT "web_to_lead_submissions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "integration_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "web_to_lead_submissions" ADD CONSTRAINT "web_to_lead_submissions_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT roles."id", permissions."id"
FROM "roles" AS roles
JOIN "permissions" AS permissions ON permissions."key" = 'integration.manage'
WHERE roles."name" = 'Manager' AND roles."is_system" = true
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
