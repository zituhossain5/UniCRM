CREATE TYPE "EmailDirection" AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE "MailboxConnectionStatus" AS ENUM ('CONNECTED', 'SYNCING', 'ERROR', 'DISABLED');
CREATE TYPE "MailboxIncomingProtocol" AS ENUM ('IMAP');

CREATE TABLE "mailbox_connections" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "email_address" VARCHAR(320) NOT NULL,
  "display_name" VARCHAR(160),
  "status" "MailboxConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
  "incoming_protocol" "MailboxIncomingProtocol" NOT NULL DEFAULT 'IMAP',
  "imap_host" VARCHAR(255) NOT NULL,
  "imap_port" INTEGER NOT NULL,
  "imap_secure" BOOLEAN NOT NULL DEFAULT true,
  "smtp_host" VARCHAR(255) NOT NULL,
  "smtp_port" INTEGER NOT NULL,
  "smtp_secure" BOOLEAN NOT NULL DEFAULT true,
  "username" VARCHAR(320) NOT NULL,
  "encrypted_credential" TEXT NOT NULL,
  "last_synced_at" TIMESTAMP(3),
  "sync_state" JSONB,
  "safe_error_summary" VARCHAR(500),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mailbox_connections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "email_threads" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "mailbox_connection_id" UUID,
  "related_entity_type" "EmailRelatedEntityType",
  "related_entity_id" UUID,
  "subject" VARCHAR(300) NOT NULL,
  "last_message_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "email_threads_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "email_messages"
  ALTER COLUMN "sender_user_id" DROP NOT NULL,
  ALTER COLUMN "related_entity_type" DROP NOT NULL,
  ALTER COLUMN "related_entity_id" DROP NOT NULL,
  ADD COLUMN "mailbox_connection_id" UUID,
  ADD COLUMN "thread_id" UUID,
  ADD COLUMN "direction" "EmailDirection" NOT NULL DEFAULT 'OUTBOUND',
  ADD COLUMN "external_message_id" VARCHAR(998),
  ADD COLUMN "in_reply_to" VARCHAR(998),
  ADD COLUMN "references" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "provider_uid" VARCHAR(128),
  ADD COLUMN "folder" VARCHAR(64),
  ADD COLUMN "received_at" TIMESTAMP(3);

ALTER TABLE "email_messages" DROP CONSTRAINT "email_messages_sender_user_id_fkey";
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_sender_user_id_fkey"
  FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "email_attachments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "email_message_id" UUID NOT NULL,
  "file_name" VARCHAR(255) NOT NULL,
  "mime_type" VARCHAR(255) NOT NULL,
  "size" INTEGER NOT NULL,
  "storage_key" TEXT NOT NULL,
  "content_id" VARCHAR(998),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_attachments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mailbox_connections_organization_id_email_address_key" ON "mailbox_connections"("organization_id", "email_address");
CREATE INDEX "mailbox_connections_organization_id_status_updated_at_idx" ON "mailbox_connections"("organization_id", "status", "updated_at");
CREATE INDEX "email_threads_organization_id_mailbox_connection_id_last_message_at_idx" ON "email_threads"("organization_id", "mailbox_connection_id", "last_message_at");
CREATE INDEX "email_threads_organization_id_related_entity_type_related_entity_id_last_message_at_idx" ON "email_threads"("organization_id", "related_entity_type", "related_entity_id", "last_message_at");
CREATE UNIQUE INDEX "email_messages_mailbox_connection_id_external_message_id_key" ON "email_messages"("mailbox_connection_id", "external_message_id");
CREATE UNIQUE INDEX "email_messages_mailbox_connection_id_folder_provider_uid_key" ON "email_messages"("mailbox_connection_id", "folder", "provider_uid");
CREATE INDEX "email_messages_organization_id_mailbox_connection_id_direction_created_at_idx" ON "email_messages"("organization_id", "mailbox_connection_id", "direction", "created_at");
CREATE INDEX "email_messages_organization_id_thread_id_created_at_idx" ON "email_messages"("organization_id", "thread_id", "created_at");
CREATE UNIQUE INDEX "email_attachments_storage_key_key" ON "email_attachments"("storage_key");
CREATE INDEX "email_attachments_organization_id_email_message_id_idx" ON "email_attachments"("organization_id", "email_message_id");

ALTER TABLE "mailbox_connections" ADD CONSTRAINT "mailbox_connections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_mailbox_connection_id_fkey" FOREIGN KEY ("mailbox_connection_id") REFERENCES "mailbox_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_mailbox_connection_id_fkey" FOREIGN KEY ("mailbox_connection_id") REFERENCES "mailbox_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "email_threads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "email_attachments" ADD CONSTRAINT "email_attachments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_attachments" ADD CONSTRAINT "email_attachments_email_message_id_fkey" FOREIGN KEY ("email_message_id") REFERENCES "email_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "key", "description", "created_at") VALUES
  ('e0000000-0000-4000-8000-000000000001', 'mailbox.read', 'View organization mailbox connections', CURRENT_TIMESTAMP),
  ('e0000000-0000-4000-8000-000000000002', 'mailbox.manage', 'Manage organization mailbox connections', CURRENT_TIMESTAMP),
  ('e0000000-0000-4000-8000-000000000003', 'mail.read', 'View synchronized mailbox messages and threads', CURRENT_TIMESTAMP),
  ('e0000000-0000-4000-8000-000000000004', 'mail.send', 'Send and reply through connected mailboxes', CURRENT_TIMESTAMP),
  ('e0000000-0000-4000-8000-000000000005', 'mail.link', 'Link mailbox threads to CRM records', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";

WITH default_grants("role_name", "permission_key") AS (
  VALUES
    ('Owner', 'mailbox.read'), ('Owner', 'mailbox.manage'), ('Owner', 'mail.read'), ('Owner', 'mail.send'), ('Owner', 'mail.link'),
    ('Admin', 'mailbox.read'), ('Admin', 'mailbox.manage'), ('Admin', 'mail.read'), ('Admin', 'mail.send'), ('Admin', 'mail.link'),
    ('Manager', 'mailbox.read'), ('Manager', 'mail.read'), ('Manager', 'mail.send'), ('Manager', 'mail.link'),
    ('Staff', 'mail.read'), ('Staff', 'mail.send'),
    ('Viewer', 'mail.read')
)
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT roles."id", permissions."id"
FROM default_grants
JOIN "roles" AS roles ON roles."name" = default_grants."role_name" AND roles."is_system" = true
JOIN "permissions" AS permissions ON permissions."key" = default_grants."permission_key"
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
