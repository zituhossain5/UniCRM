CREATE TYPE "InboxThreadStatus" AS ENUM ('UNASSIGNED', 'OPEN', 'WAITING', 'RESOLVED', 'CLOSED');
CREATE TYPE "InboxPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "ConversationEventType" AS ENUM (
  'ASSIGNED',
  'REASSIGNED',
  'UNASSIGNED',
  'STATUS_CHANGED',
  'PRIORITY_CHANGED',
  'DUE_AT_CHANGED',
  'NOTE_ADDED',
  'CRM_LINKED',
  'RESOLVED',
  'REOPENED'
);

ALTER TYPE "NotificationType" ADD VALUE 'INBOX_ASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE 'INBOX_DUE';

ALTER TABLE "email_threads"
  ADD COLUMN "assigned_user_id" UUID,
  ADD COLUMN "inbox_status" "InboxThreadStatus" NOT NULL DEFAULT 'UNASSIGNED',
  ADD COLUMN "inbox_priority" "InboxPriority" NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN "is_unread" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "due_at" TIMESTAMP(3),
  ADD COLUMN "resolved_at" TIMESTAMP(3);

UPDATE "email_threads" AS thread
SET "is_unread" = true
WHERE EXISTS (
  SELECT 1 FROM "email_messages" AS message
  WHERE message."thread_id" = thread."id" AND message."direction" = 'INBOUND'
);

ALTER TABLE "email_threads" ALTER COLUMN "is_unread" SET DEFAULT true;

CREATE TABLE "conversation_notes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "thread_id" UUID NOT NULL,
  "author_user_id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "conversation_notes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "conversation_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "thread_id" UUID NOT NULL,
  "actor_user_id" UUID,
  "type" "ConversationEventType" NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "conversation_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "email_threads_organization_id_inbox_status_inbox_priority_last_message_at_idx" ON "email_threads"("organization_id", "inbox_status", "inbox_priority", "last_message_at");
CREATE INDEX "email_threads_organization_id_assigned_user_id_inbox_status_last_message_at_idx" ON "email_threads"("organization_id", "assigned_user_id", "inbox_status", "last_message_at");
CREATE INDEX "email_threads_organization_id_is_unread_due_at_idx" ON "email_threads"("organization_id", "is_unread", "due_at");
CREATE INDEX "conversation_notes_organization_id_thread_id_created_at_idx" ON "conversation_notes"("organization_id", "thread_id", "created_at");
CREATE INDEX "conversation_events_organization_id_thread_id_created_at_idx" ON "conversation_events"("organization_id", "thread_id", "created_at");

ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conversation_notes" ADD CONSTRAINT "conversation_notes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_notes" ADD CONSTRAINT "conversation_notes_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "email_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_notes" ADD CONSTRAINT "conversation_notes_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conversation_events" ADD CONSTRAINT "conversation_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_events" ADD CONSTRAINT "conversation_events_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "email_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_events" ADD CONSTRAINT "conversation_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "key", "description", "created_at") VALUES
  ('f0000000-0000-4000-8000-000000000001', 'inbox.read', 'View shared inbox conversations', CURRENT_TIMESTAMP),
  ('f0000000-0000-4000-8000-000000000002', 'inbox.assign', 'Assign shared inbox conversations', CURRENT_TIMESTAMP),
  ('f0000000-0000-4000-8000-000000000003', 'inbox.reply', 'Reply to shared inbox conversations', CURRENT_TIMESTAMP),
  ('f0000000-0000-4000-8000-000000000004', 'inbox.note', 'Add internal shared inbox notes', CURRENT_TIMESTAMP),
  ('f0000000-0000-4000-8000-000000000005', 'inbox.status.update', 'Update shared inbox conversation status and due time', CURRENT_TIMESTAMP),
  ('f0000000-0000-4000-8000-000000000006', 'inbox.priority.update', 'Update shared inbox conversation priority', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";

WITH default_grants("role_name", "permission_key") AS (
  VALUES
    ('Owner', 'inbox.read'), ('Owner', 'inbox.assign'), ('Owner', 'inbox.reply'), ('Owner', 'inbox.note'), ('Owner', 'inbox.status.update'), ('Owner', 'inbox.priority.update'),
    ('Admin', 'inbox.read'), ('Admin', 'inbox.assign'), ('Admin', 'inbox.reply'), ('Admin', 'inbox.note'), ('Admin', 'inbox.status.update'), ('Admin', 'inbox.priority.update'),
    ('Manager', 'inbox.read'), ('Manager', 'inbox.assign'), ('Manager', 'inbox.reply'), ('Manager', 'inbox.note'), ('Manager', 'inbox.status.update'), ('Manager', 'inbox.priority.update'),
    ('Staff', 'inbox.read'), ('Staff', 'inbox.assign'), ('Staff', 'inbox.reply'), ('Staff', 'inbox.note'),
    ('Viewer', 'inbox.read')
)
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT roles."id", permissions."id"
FROM default_grants
JOIN "roles" AS roles ON roles."name" = default_grants."role_name" AND roles."is_system" = true
JOIN "permissions" AS permissions ON permissions."key" = default_grants."permission_key"
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
