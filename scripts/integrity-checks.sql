-- UniCRM internal-beta integrity checks.
-- Run against a restored test database before beta launch and after migration dry runs.

-- Attachments must belong to exactly one parent and match that parent's organization.
SELECT attachment.id, attachment.organization_id, attachment.project_id, attachment.task_id
FROM attachments attachment
LEFT JOIN projects project ON project.id = attachment.project_id
LEFT JOIN tasks task ON task.id = attachment.task_id
WHERE (attachment.project_id IS NULL AND attachment.task_id IS NULL)
   OR (attachment.project_id IS NOT NULL AND attachment.task_id IS NOT NULL)
   OR (project.id IS NOT NULL AND project.organization_id <> attachment.organization_id)
   OR (task.id IS NOT NULL AND task.organization_id <> attachment.organization_id);

-- Notifications must target a user in the same organization.
SELECT notification.id, notification.organization_id, notification.user_id
FROM notifications notification
JOIN users app_user ON app_user.id = notification.user_id
WHERE app_user.organization_id <> notification.organization_id;

-- Active sessions must target active users and active organizations.
SELECT session.id, session.user_id, session.organization_id
FROM auth_sessions session
JOIN users app_user ON app_user.id = session.user_id
JOIN organizations organization ON organization.id = session.organization_id
WHERE session.revoked_at IS NULL
  AND session.expires_at > now()
  AND (app_user.status <> 'ACTIVE' OR organization.status <> 'ACTIVE');

-- Quotations with accepted status should have at least one item.
SELECT quotation.id, quotation.quotation_number
FROM quotations quotation
LEFT JOIN quotation_items item ON item.quotation_id = quotation.id
WHERE quotation.status = 'ACCEPTED'
GROUP BY quotation.id, quotation.quotation_number
HAVING count(item.id) = 0;
