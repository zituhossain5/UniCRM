ALTER TABLE "projects"
ADD CONSTRAINT "projects_progress_range" CHECK ("progress" BETWEEN 0 AND 100);

ALTER TABLE "tasks"
ADD CONSTRAINT "tasks_estimated_minutes_positive"
CHECK ("estimated_minutes" IS NULL OR "estimated_minutes" > 0);

ALTER TABLE "attachments"
ADD CONSTRAINT "attachments_exactly_one_parent"
CHECK (("project_id" IS NOT NULL)::int + ("task_id" IS NOT NULL)::int = 1),
ADD CONSTRAINT "attachments_size_positive" CHECK ("size" > 0);
