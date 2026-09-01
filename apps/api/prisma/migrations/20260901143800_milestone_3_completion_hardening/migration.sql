-- CreateIndex
CREATE INDEX "companies_organization_id_archived_at_created_at_idx" ON "companies"("organization_id", "archived_at", "created_at");

-- CreateIndex
CREATE INDEX "contacts_organization_id_archived_at_created_at_idx" ON "contacts"("organization_id", "archived_at", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_one_primary_per_company" ON "contacts"("company_id") WHERE ("is_primary" = true AND "archived_at" IS NULL);

-- CreateIndex
CREATE INDEX "leads_organization_id_priority_archived_at_created_at_idx" ON "leads"("organization_id", "priority", "archived_at", "created_at");

-- CreateIndex
CREATE INDEX "leads_organization_id_source_archived_at_created_at_idx" ON "leads"("organization_id", "source", "archived_at", "created_at");
