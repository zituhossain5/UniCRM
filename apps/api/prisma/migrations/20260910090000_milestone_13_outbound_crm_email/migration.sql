CREATE TYPE "EmailRelatedEntityType" AS ENUM ('LEAD', 'CONTACT', 'COMPANY');
CREATE TYPE "EmailMessageStatus" AS ENUM ('DRAFT', 'QUEUED', 'SENDING', 'SENT', 'FAILED');

ALTER TABLE "organizations"
  ADD COLUMN "email_from_name" VARCHAR(160),
  ADD COLUMN "email_from_address" VARCHAR(320),
  ADD COLUMN "email_reply_to" VARCHAR(320);

CREATE TABLE "email_templates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "subject" VARCHAR(300) NOT NULL,
  "body" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_by_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "email_messages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "sender_user_id" UUID NOT NULL,
  "template_id" UUID,
  "related_entity_type" "EmailRelatedEntityType" NOT NULL,
  "related_entity_id" UUID NOT NULL,
  "from_name" VARCHAR(160) NOT NULL,
  "from_address" VARCHAR(320) NOT NULL,
  "reply_to" VARCHAR(320),
  "to_addresses" TEXT[],
  "cc_addresses" TEXT[],
  "subject" VARCHAR(300) NOT NULL,
  "body" TEXT NOT NULL,
  "status" "EmailMessageStatus" NOT NULL DEFAULT 'DRAFT',
  "queued_at" TIMESTAMP(3),
  "sent_at" TIMESTAMP(3),
  "failed_at" TIMESTAMP(3),
  "safe_error_summary" VARCHAR(1000),
  "idempotency_key" VARCHAR(300),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "email_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "email_templates_organization_id_name_key" ON "email_templates"("organization_id", "name");
CREATE INDEX "email_templates_organization_id_active_updated_at_idx" ON "email_templates"("organization_id", "active", "updated_at");
CREATE UNIQUE INDEX "email_messages_organization_id_idempotency_key_key" ON "email_messages"("organization_id", "idempotency_key");
CREATE INDEX "email_messages_organization_id_related_entity_type_related_entity_id_created_at_idx" ON "email_messages"("organization_id", "related_entity_type", "related_entity_id", "created_at");
CREATE INDEX "email_messages_organization_id_status_created_at_idx" ON "email_messages"("organization_id", "status", "created_at");

ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "email_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "key", "description", "created_at") VALUES
  ('d0000000-0000-4000-8000-000000000001', 'email.read', 'View CRM email history and messages', CURRENT_TIMESTAMP),
  ('d0000000-0000-4000-8000-000000000002', 'email.send', 'Send CRM email', CURRENT_TIMESTAMP),
  ('d0000000-0000-4000-8000-000000000003', 'email_template.read', 'View email templates and sending identity', CURRENT_TIMESTAMP),
  ('d0000000-0000-4000-8000-000000000004', 'email_template.manage', 'Manage email templates and sending identity', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";

WITH default_grants("role_name", "permission_key") AS (
  VALUES
    ('Owner', 'email.read'), ('Owner', 'email.send'), ('Owner', 'email_template.read'), ('Owner', 'email_template.manage'),
    ('Admin', 'email.read'), ('Admin', 'email.send'), ('Admin', 'email_template.read'), ('Admin', 'email_template.manage'),
    ('Manager', 'email.read'), ('Manager', 'email.send'), ('Manager', 'email_template.read'),
    ('Staff', 'email.read'), ('Staff', 'email.send'),
    ('Viewer', 'email.read')
)
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT roles."id", permissions."id"
FROM default_grants
JOIN "roles" AS roles ON roles."name" = default_grants."role_name" AND roles."is_system" = true
JOIN "permissions" AS permissions ON permissions."key" = default_grants."permission_key"
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

INSERT INTO "email_templates" ("organization_id", "name", "subject", "body", "created_by_id", "updated_at")
SELECT organizations."id", 'Qualified Lead Follow-up',
  'Following up on {{lead.title}}',
  E'Hi {{contact.firstName}},\n\nI’m following up regarding {{lead.title}} for {{company.name}}.\n\nPlease let me know if you would like to discuss next steps.\n\nBest,\n{{user.firstName}}\n{{organization.name}}',
  owners."id", CURRENT_TIMESTAMP
FROM "organizations" AS organizations
JOIN LATERAL (
  SELECT users."id"
  FROM "users"
  JOIN "user_roles" ON "user_roles"."user_id" = users."id"
  JOIN "roles" ON "roles"."id" = "user_roles"."role_id"
  WHERE users."organization_id" = organizations."id" AND roles."name" IN ('Owner', 'Admin')
  ORDER BY CASE roles."name" WHEN 'Owner' THEN 0 ELSE 1 END, users."created_at"
  LIMIT 1
) owners ON true
ON CONFLICT ("organization_id", "name") DO NOTHING;
