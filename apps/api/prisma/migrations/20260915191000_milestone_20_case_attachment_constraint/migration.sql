ALTER TABLE "attachments"
DROP CONSTRAINT "attachments_exactly_one_parent",
ADD CONSTRAINT "attachments_exactly_one_parent"
CHECK (
  ("project_id" IS NOT NULL)::int +
  ("task_id" IS NOT NULL)::int +
  ("case_id" IS NOT NULL)::int = 1
);
