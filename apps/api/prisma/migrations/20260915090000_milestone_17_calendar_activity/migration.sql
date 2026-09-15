ALTER TYPE "NotificationType" ADD VALUE 'ACTIVITY_REMINDER';

CREATE TYPE "ScheduledActivityType" AS ENUM ('CALL', 'MEETING', 'FOLLOW_UP', 'OTHER');
CREATE TYPE "ScheduledActivityStatus" AS ENUM ('PLANNED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "ScheduledActivityRelatedEntityType" AS ENUM ('LEAD', 'DEAL', 'CONTACT', 'COMPANY');

CREATE TABLE "scheduled_activities" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "type" "ScheduledActivityType" NOT NULL,
  "subject" VARCHAR(220) NOT NULL,
  "description" TEXT,
  "related_entity_type" "ScheduledActivityRelatedEntityType" NOT NULL,
  "related_entity_id" UUID NOT NULL,
  "owner_id" UUID NOT NULL,
  "start_at" TIMESTAMP(3) NOT NULL,
  "end_at" TIMESTAMP(3),
  "status" "ScheduledActivityStatus" NOT NULL DEFAULT 'PLANNED',
  "priority" "WorkPriority" NOT NULL DEFAULT 'MEDIUM',
  "reminder_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "automation_key" VARCHAR(220),
  "created_by_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "scheduled_activities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "scheduled_activities_time_check" CHECK ("end_at" IS NULL OR "end_at" >= "start_at"),
  CONSTRAINT "scheduled_activities_reminder_check" CHECK ("reminder_at" IS NULL OR "reminder_at" <= "start_at")
);

CREATE INDEX "scheduled_activities_organization_id_status_start_at_idx" ON "scheduled_activities"("organization_id", "status", "start_at");
CREATE INDEX "scheduled_activities_organization_id_owner_id_status_start_at_idx" ON "scheduled_activities"("organization_id", "owner_id", "status", "start_at");
CREATE INDEX "scheduled_activities_organization_id_related_entity_type_related_entity_id_start_at_idx" ON "scheduled_activities"("organization_id", "related_entity_type", "related_entity_id", "start_at");
CREATE INDEX "scheduled_activities_organization_id_reminder_at_status_idx" ON "scheduled_activities"("organization_id", "reminder_at", "status");
CREATE UNIQUE INDEX "scheduled_activities_automation_key_key" ON "scheduled_activities"("automation_key");

ALTER TABLE "scheduled_activities" ADD CONSTRAINT "scheduled_activities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scheduled_activities" ADD CONSTRAINT "scheduled_activities_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "scheduled_activities" ADD CONSTRAINT "scheduled_activities_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
