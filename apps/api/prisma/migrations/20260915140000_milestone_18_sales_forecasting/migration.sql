CREATE INDEX "deals_organization_id_pipeline_id_archived_at_idx"
  ON "deals"("organization_id", "pipeline_id", "archived_at");
CREATE INDEX "deals_organization_id_won_at_idx" ON "deals"("organization_id", "won_at");
CREATE INDEX "deals_organization_id_lost_at_idx" ON "deals"("organization_id", "lost_at");
CREATE INDEX "deals_organization_id_created_at_idx" ON "deals"("organization_id", "created_at");

INSERT INTO "permissions" ("id", "key", "description", "created_at") VALUES
  ('a1800000-0000-4000-8000-000000000001', 'forecast.read', 'View sales forecasts for permitted deals', CURRENT_TIMESTAMP),
  ('a1800000-0000-4000-8000-000000000002', 'forecast.read_all', 'View organization-wide sales forecasts', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";

WITH default_grants("role_name", "permission_key") AS (
  VALUES
    ('Owner', 'forecast.read'), ('Owner', 'forecast.read_all'),
    ('Admin', 'forecast.read'), ('Admin', 'forecast.read_all'),
    ('Manager', 'forecast.read'), ('Manager', 'forecast.read_all'),
    ('Staff', 'forecast.read'),
    ('Viewer', 'forecast.read')
)
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT roles."id", permissions."id"
FROM default_grants
JOIN "roles" AS roles ON roles."name" = default_grants."role_name" AND roles."is_system" = true
JOIN "permissions" AS permissions ON permissions."key" = default_grants."permission_key"
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
