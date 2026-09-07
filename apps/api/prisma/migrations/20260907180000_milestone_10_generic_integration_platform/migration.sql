CREATE TYPE "IntegrationProvider" AS ENUM ('CUSTOM', 'UNICODE_COMMERCE', 'META', 'SHOPIFY', 'WOOCOMMERCE');
CREATE TYPE "IntegrationConnectionStatus" AS ENUM ('ACTIVE', 'DISABLED', 'ERROR');
CREATE TYPE "IntegrationDirection" AS ENUM ('INBOUND', 'OUTBOUND', 'BOTH');
CREATE TYPE "IntegrationEventDirection" AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE "IntegrationEventStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED');
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'DELIVERED', 'FAILED');
CREATE TYPE "UnicrmIntegrationEntityType" AS ENUM ('LEAD', 'COMPANY', 'CONTACT', 'PROJECT', 'TASK');

CREATE TABLE "integration_connections" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "provider" "IntegrationProvider" NOT NULL,
  "status" "IntegrationConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
  "direction" "IntegrationDirection" NOT NULL DEFAULT 'BOTH',
  "configuration" JSONB,
  "encrypted_secret" TEXT NOT NULL,
  "secret_last_four" VARCHAR(4) NOT NULL,
  "secret_rotated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_activity_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "integration_connections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "integration_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "connection_id" UUID,
  "direction" "IntegrationEventDirection" NOT NULL,
  "external_event_id" VARCHAR(160) NOT NULL,
  "event_type" VARCHAR(120) NOT NULL,
  "status" "IntegrationEventStatus" NOT NULL DEFAULT 'RECEIVED',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "retryable" BOOLEAN NOT NULL DEFAULT false,
  "payload" JSONB,
  "metadata" JSONB,
  "received_at" TIMESTAMP(3),
  "processed_at" TIMESTAMP(3),
  "last_error" VARCHAR(1000),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "integration_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "webhook_subscriptions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "connection_id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "target_url" VARCHAR(2048) NOT NULL,
  "encrypted_secret" TEXT NOT NULL,
  "secret_last_four" VARCHAR(4) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "event_types" TEXT[] NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "webhook_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "webhook_deliveries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "subscription_id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "event_type" VARCHAR(120) NOT NULL,
  "payload" JSONB NOT NULL,
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "status_code" INTEGER,
  "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "retryable" BOOLEAN NOT NULL DEFAULT true,
  "last_error" VARCHAR(1000),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "delivered_at" TIMESTAMP(3),
  CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "external_entity_mappings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "connection_id" UUID NOT NULL,
  "external_entity_type" VARCHAR(80) NOT NULL,
  "external_entity_id" VARCHAR(255) NOT NULL,
  "unicrm_entity_type" "UnicrmIntegrationEntityType" NOT NULL,
  "unicrm_entity_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "external_entity_mappings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "integration_connections_organization_id_name_key" ON "integration_connections"("organization_id", "name");
CREATE INDEX "integration_connections_organization_id_status_created_at_idx" ON "integration_connections"("organization_id", "status", "created_at");
CREATE UNIQUE INDEX "integration_events_connection_id_external_event_id_key" ON "integration_events"("connection_id", "external_event_id");
CREATE INDEX "integration_events_organization_id_status_created_at_idx" ON "integration_events"("organization_id", "status", "created_at");
CREATE INDEX "integration_events_organization_id_direction_created_at_idx" ON "integration_events"("organization_id", "direction", "created_at");
CREATE UNIQUE INDEX "webhook_subscriptions_organization_id_name_key" ON "webhook_subscriptions"("organization_id", "name");
CREATE INDEX "webhook_subscriptions_organization_id_active_created_at_idx" ON "webhook_subscriptions"("organization_id", "active", "created_at");
CREATE INDEX "webhook_subscriptions_organization_id_connection_id_idx" ON "webhook_subscriptions"("organization_id", "connection_id");
CREATE UNIQUE INDEX "webhook_deliveries_subscription_id_event_id_key" ON "webhook_deliveries"("subscription_id", "event_id");
CREATE INDEX "webhook_deliveries_organization_id_status_created_at_idx" ON "webhook_deliveries"("organization_id", "status", "created_at");
CREATE INDEX "webhook_deliveries_organization_id_subscription_id_created_at_idx" ON "webhook_deliveries"("organization_id", "subscription_id", "created_at");
CREATE UNIQUE INDEX "external_entity_mappings_connection_id_external_entity_type_external_entity_id_key" ON "external_entity_mappings"("connection_id", "external_entity_type", "external_entity_id");
CREATE INDEX "external_entity_mappings_organization_id_unicrm_entity_type_unicrm_entity_id_idx" ON "external_entity_mappings"("organization_id", "unicrm_entity_type", "unicrm_entity_id");
CREATE INDEX "external_entity_mappings_organization_id_connection_id_idx" ON "external_entity_mappings"("organization_id", "connection_id");

ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integration_events" ADD CONSTRAINT "integration_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integration_events" ADD CONSTRAINT "integration_events_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "integration_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "integration_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "webhook_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "external_entity_mappings" ADD CONSTRAINT "external_entity_mappings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "external_entity_mappings" ADD CONSTRAINT "external_entity_mappings_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "integration_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "key", "description", "created_at") VALUES
  ('a0000000-0000-4000-8000-000000000001', 'integration.read', 'View integration connections and mappings', CURRENT_TIMESTAMP),
  ('a0000000-0000-4000-8000-000000000002', 'integration.manage', 'Manage integration connections and mappings', CURRENT_TIMESTAMP),
  ('a0000000-0000-4000-8000-000000000003', 'integration.logs.read', 'View integration events and webhook deliveries', CURRENT_TIMESTAMP),
  ('a0000000-0000-4000-8000-000000000004', 'integration.retry', 'Retry failed integration events and deliveries', CURRENT_TIMESTAMP),
  ('a0000000-0000-4000-8000-000000000005', 'webhook.manage', 'Manage outbound webhook subscriptions', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";

WITH default_grants("role_name", "permission_key") AS (
  VALUES
    ('Owner', 'integration.read'), ('Owner', 'integration.manage'), ('Owner', 'integration.logs.read'), ('Owner', 'integration.retry'), ('Owner', 'webhook.manage'),
    ('Admin', 'integration.read'), ('Admin', 'integration.manage'), ('Admin', 'integration.logs.read'), ('Admin', 'integration.retry'), ('Admin', 'webhook.manage'),
    ('Manager', 'integration.read'), ('Manager', 'integration.logs.read'), ('Manager', 'integration.retry')
)
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT roles."id", permissions."id"
FROM default_grants
JOIN "roles" AS roles ON roles."name" = default_grants."role_name" AND roles."is_system" = true
JOIN "permissions" AS permissions ON permissions."key" = default_grants."permission_key"
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
