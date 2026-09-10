UPDATE "email_templates"
SET
  "subject" = 'Next steps for {{lead.title}}',
  "body" = E'Hi {{contact.firstName}},\n\nThank you for discussing {{lead.title}} with us.\n\nWe would like to move forward with the next steps.\n\nRegards,\n{{user.firstName}}',
  "updated_at" = CURRENT_TIMESTAMP
WHERE "name" = 'Qualified Lead Follow-up';
