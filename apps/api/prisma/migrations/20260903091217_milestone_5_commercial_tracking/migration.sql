-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('BANK_TRANSFER', 'CASH', 'CARD', 'MOBILE_BANKING', 'CHEQUE', 'OTHER');

-- CreateTable
CREATE TABLE "quotation_number_counters" (
    "organization_id" UUID NOT NULL,
    "next_number" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotation_number_counters_pkey" PRIMARY KEY ("organization_id")
);

-- CreateTable
CREATE TABLE "quotations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "quotation_number" VARCHAR(32) NOT NULL,
    "company_id" UUID NOT NULL,
    "contact_id" UUID,
    "lead_id" UUID,
    "project_id" UUID,
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "issue_date" DATE NOT NULL,
    "expiry_date" DATE,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'BDT',
    "subtotal" DECIMAL(19,2) NOT NULL DEFAULT 0,
    "discount_type" "DiscountType",
    "discount_value" DECIMAL(19,4),
    "discount_amount" DECIMAL(19,2) NOT NULL DEFAULT 0,
    "tax_rate" DECIMAL(9,4),
    "tax_amount" DECIMAL(19,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(19,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "terms" TEXT,
    "created_by_id" UUID NOT NULL,
    "sent_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "pdf_snapshot_key" UUID,
    "pdf_snapshot_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_items" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "quotation_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL,
    "unit_price" DECIMAL(19,2) NOT NULL,
    "amount" DECIMAL(19,2) NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "project_id" UUID,
    "quotation_id" UUID,
    "amount" DECIMAL(19,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "payment_date" DATE NOT NULL,
    "method" "PaymentMethod",
    "reference" TEXT,
    "notes" TEXT,
    "recorded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- Financial invariants remain enforced even for writes outside the application.
ALTER TABLE "quotation_number_counters"
  ADD CONSTRAINT "quotation_number_counters_next_number_positive" CHECK ("next_number" > 0);

ALTER TABLE "quotations"
  ADD CONSTRAINT "quotations_currency_iso_code" CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "quotations_amounts_non_negative" CHECK (
    "subtotal" >= 0 AND "discount_amount" >= 0 AND "tax_amount" >= 0 AND "total" >= 0
  ),
  ADD CONSTRAINT "quotations_discount_value_non_negative" CHECK ("discount_value" IS NULL OR "discount_value" >= 0),
  ADD CONSTRAINT "quotations_percentage_discount_range" CHECK (
    "discount_type" IS DISTINCT FROM 'PERCENTAGE' OR "discount_value" BETWEEN 0 AND 100
  ),
  ADD CONSTRAINT "quotations_tax_rate_range" CHECK ("tax_rate" IS NULL OR "tax_rate" BETWEEN 0 AND 100),
  ADD CONSTRAINT "quotations_expiry_after_issue" CHECK ("expiry_date" IS NULL OR "expiry_date" >= "issue_date");

ALTER TABLE "quotation_items"
  ADD CONSTRAINT "quotation_items_quantity_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "quotation_items_prices_non_negative" CHECK ("unit_price" >= 0 AND "amount" >= 0),
  ADD CONSTRAINT "quotation_items_position_non_negative" CHECK ("position" >= 0);

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_positive" CHECK ("amount" > 0),
  ADD CONSTRAINT "payments_currency_iso_code" CHECK ("currency" ~ '^[A-Z]{3}$');

-- CreateIndex
CREATE UNIQUE INDEX "quotations_pdf_snapshot_key_key" ON "quotations"("pdf_snapshot_key");

-- CreateIndex
CREATE INDEX "quotations_organization_id_archived_at_created_at_idx" ON "quotations"("organization_id", "archived_at", "created_at");

-- CreateIndex
CREATE INDEX "quotations_organization_id_company_id_archived_at_idx" ON "quotations"("organization_id", "company_id", "archived_at");

-- CreateIndex
CREATE INDEX "quotations_organization_id_lead_id_idx" ON "quotations"("organization_id", "lead_id");

-- CreateIndex
CREATE INDEX "quotations_organization_id_project_id_idx" ON "quotations"("organization_id", "project_id");

-- CreateIndex
CREATE INDEX "quotations_organization_id_status_archived_at_idx" ON "quotations"("organization_id", "status", "archived_at");

-- CreateIndex
CREATE INDEX "quotations_organization_id_issue_date_idx" ON "quotations"("organization_id", "issue_date");

-- CreateIndex
CREATE INDEX "quotations_organization_id_expiry_date_idx" ON "quotations"("organization_id", "expiry_date");

-- CreateIndex
CREATE UNIQUE INDEX "quotations_organization_id_quotation_number_key" ON "quotations"("organization_id", "quotation_number");

-- CreateIndex
CREATE INDEX "quotation_items_organization_id_quotation_id_idx" ON "quotation_items"("organization_id", "quotation_id");

-- CreateIndex
CREATE UNIQUE INDEX "quotation_items_quotation_id_position_key" ON "quotation_items"("quotation_id", "position");

-- CreateIndex
CREATE INDEX "payments_organization_id_archived_at_created_at_idx" ON "payments"("organization_id", "archived_at", "created_at");

-- CreateIndex
CREATE INDEX "payments_organization_id_company_id_payment_date_idx" ON "payments"("organization_id", "company_id", "payment_date");

-- CreateIndex
CREATE INDEX "payments_organization_id_project_id_payment_date_idx" ON "payments"("organization_id", "project_id", "payment_date");

-- CreateIndex
CREATE INDEX "payments_organization_id_quotation_id_payment_date_idx" ON "payments"("organization_id", "quotation_id", "payment_date");

-- AddForeignKey
ALTER TABLE "quotation_number_counters" ADD CONSTRAINT "quotation_number_counters_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
