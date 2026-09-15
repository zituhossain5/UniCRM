INSERT INTO "permissions" ("id", "key", "description", "created_at") VALUES
  ('a1700000-0000-4000-8000-000000000001', 'activity.update', 'Update and complete scheduled activities', CURRENT_TIMESTAMP),
  ('a1700000-0000-4000-8000-000000000002', 'activity.delete', 'Cancel or delete scheduled activities', CURRENT_TIMESTAMP),
  ('a1700000-0000-4000-8000-000000000003', 'activity.assign', 'Assign scheduled activity owners', CURRENT_TIMESTAMP),
  ('a1700000-0000-4000-8000-000000000004', 'calendar.read', 'View the organization activity calendar', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";

WITH default_grants("role_name", "permission_key") AS (
  VALUES
    ('Owner', 'activity.update'), ('Owner', 'activity.delete'), ('Owner', 'activity.assign'), ('Owner', 'calendar.read'),
    ('Admin', 'activity.update'), ('Admin', 'activity.delete'), ('Admin', 'activity.assign'), ('Admin', 'calendar.read'),
    ('Manager', 'activity.update'), ('Manager', 'activity.delete'), ('Manager', 'activity.assign'), ('Manager', 'calendar.read'),
    ('Staff', 'activity.update'), ('Staff', 'activity.assign'), ('Staff', 'calendar.read'),
    ('Viewer', 'calendar.read')
)
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT roles."id", permissions."id"
FROM default_grants
JOIN "roles" AS roles ON roles."name" = default_grants."role_name" AND roles."is_system" = true
JOIN "permissions" AS permissions ON permissions."key" = default_grants."permission_key"
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
