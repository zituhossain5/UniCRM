INSERT INTO "permissions" ("id", "key", "description", "created_at") VALUES
  ('a1600000-0000-4000-8000-000000000001', 'deal.create', 'Create deals', CURRENT_TIMESTAMP),
  ('a1600000-0000-4000-8000-000000000002', 'deal.read', 'View deals', CURRENT_TIMESTAMP),
  ('a1600000-0000-4000-8000-000000000003', 'deal.update', 'Update deals', CURRENT_TIMESTAMP),
  ('a1600000-0000-4000-8000-000000000004', 'deal.delete', 'Archive deals', CURRENT_TIMESTAMP),
  ('a1600000-0000-4000-8000-000000000005', 'deal.assign', 'Assign deal owners', CURRENT_TIMESTAMP),
  ('a1600000-0000-4000-8000-000000000006', 'deal.stage.update', 'Move deals between pipeline stages', CURRENT_TIMESTAMP),
  ('a1600000-0000-4000-8000-000000000007', 'deal.convert', 'Convert qualified leads into CRM records', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";

WITH default_grants("role_name", "permission_key") AS (
  VALUES
    ('Owner', 'deal.create'), ('Owner', 'deal.read'), ('Owner', 'deal.update'), ('Owner', 'deal.delete'), ('Owner', 'deal.assign'), ('Owner', 'deal.stage.update'), ('Owner', 'deal.convert'),
    ('Admin', 'deal.create'), ('Admin', 'deal.read'), ('Admin', 'deal.update'), ('Admin', 'deal.delete'), ('Admin', 'deal.assign'), ('Admin', 'deal.stage.update'), ('Admin', 'deal.convert'),
    ('Manager', 'deal.create'), ('Manager', 'deal.read'), ('Manager', 'deal.update'), ('Manager', 'deal.delete'), ('Manager', 'deal.assign'), ('Manager', 'deal.stage.update'), ('Manager', 'deal.convert'),
    ('Staff', 'deal.create'), ('Staff', 'deal.read'), ('Staff', 'deal.update'), ('Staff', 'deal.stage.update'), ('Staff', 'deal.convert'),
    ('Viewer', 'deal.read')
)
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT roles."id", permissions."id"
FROM default_grants
JOIN "roles" AS roles ON roles."name" = default_grants."role_name" AND roles."is_system" = true
JOIN "permissions" AS permissions ON permissions."key" = default_grants."permission_key"
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
