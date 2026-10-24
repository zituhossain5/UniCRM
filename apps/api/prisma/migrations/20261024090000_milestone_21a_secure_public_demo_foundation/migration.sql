CREATE TYPE "OrganizationMode" AS ENUM ('NORMAL', 'DEMO');

ALTER TABLE "organizations"
ADD COLUMN "mode" "OrganizationMode" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN "demo_expires_at" TIMESTAMP(3);

ALTER TABLE "email_messages"
ADD COLUMN "simulated" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "organizations_mode_demo_expires_at_idx"
ON "organizations"("mode", "demo_expires_at");
