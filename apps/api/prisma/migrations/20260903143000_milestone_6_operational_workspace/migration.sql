-- Milestone 6: organization-aware dates and idempotent in-app notifications.
CREATE TYPE "NotificationType" AS ENUM (
  'TASK_ASSIGNED',
  'TASK_DUE_SOON',
  'TASK_OVERDUE',
  'FOLLOW_UP_DUE',
  'PROJECT_DEADLINE_SOON',
  'QUOTATION_ACCEPTED',
  'PAYMENT_RECORDED'
);

ALTER TABLE "organizations"
ADD COLUMN "timezone" VARCHAR(64) NOT NULL DEFAULT 'UTC';

CREATE TABLE "notifications" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "type" "NotificationType" NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "message" VARCHAR(500) NOT NULL,
  "entity_type" VARCHAR(40),
  "entity_id" UUID,
  "dedupe_key" VARCHAR(220) NOT NULL,
  "read_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "notifications_organization_id_user_id_dedupe_key_key"
ON "notifications"("organization_id", "user_id", "dedupe_key");
CREATE INDEX "notifications_organization_id_user_id_read_at_created_at_idx"
ON "notifications"("organization_id", "user_id", "read_at", "created_at");

-- Existing organizations receive the V1 operational permissions as part of deployment.
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (md5(random()::text || clock_timestamp()::text)::uuid, 'dashboard.read', 'View the operational dashboard'),
  (md5(random()::text || clock_timestamp()::text)::uuid, 'reports.read', 'View operational reports'),
  (md5(random()::text || clock_timestamp()::text)::uuid, 'notifications.read', 'View personal notifications')
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT role."id", permission."id"
FROM "roles" role
CROSS JOIN "permissions" permission
WHERE role."name" IN ('Owner', 'Admin', 'Manager', 'Staff', 'Viewer')
  AND permission."key" IN ('dashboard.read', 'reports.read', 'notifications.read')
ON CONFLICT DO NOTHING;
