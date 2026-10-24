# UniCRM Public Demo Acceptance

Use this checklist against the private release candidate before publishing **Explore Live Demo**. Use three separate private/incognito browser profiles for isolation checks.

## Buyer journey

1. Open `https://crm.unicodeit.com`, choose **Explore Live Demo**, and confirm the demo banner and expiry are visible.
2. Review Dashboard metrics and today's work.
3. Create and update a Lead, move it through the pipeline, and create a Deal.
4. Create a Quotation from catalog items and verify totals.
5. Open a Project, create/complete a Task, and inspect its activity.
6. Open the Shared Inbox sample conversation, add a note, and send a reply. Confirm the message is marked simulated/SENT and no external mail is delivered.
7. Create and update a Case.
8. Create a safe internal Automation, trigger it once, and inspect its run history.
9. Open Forecast and Reports; verify results contain only this demo workspace.
10. Try an invitation, mailbox connection, integration, export, and password reset. Each direct API mutation must return `403` with `This action is unavailable in the public demo.`
11. Use **Restart demo** and confirm a new seeded workspace replaces only the current demo.
12. With a short expiry in a private test deployment, confirm the expired-session message appears and cleanup removes the expired demo.
13. Complete every step of the guided tour, including pause/resume and restart-tour behavior.

## Multi-visitor isolation

1. Start three sessions in three browser profiles.
2. Create one uniquely named Lead in each.
3. Search each unique name from all three profiles. Only the owning workspace may return it.
4. Copy IDs from one profile into the other profiles for users, companies, contacts, leads, deals, projects, tasks, quotations, payments, mail threads/messages, cases, attachments, and notifications. Responses must be `404` or an empty tenant-scoped result.
5. Expire and clean one workspace. Confirm the other two sessions and records remain available.
6. Log into a normal workspace in the same browser as a demo session. `/app/*` must use normal auth; `/demo/*` must use demo auth.

## Abuse and failure checks

- Exceed the demo-start rate limit and confirm `Too many demo requests. Please try again shortly.`
- Reach one configured record quota and confirm the restart-demo quota message, not a database error.
- Request a page larger than `DEMO_QUERY_MAX_PAGE_SIZE` and confirm rejection.
- Upload an allowed PDF/PNG/text file under 2 MB; reject executable, signature-mismatched, traversal-name, sixth-file, and over-2-MB uploads.
- Stop demo Redis or PostgreSQL separately and confirm demo readiness degrades without exposing connection strings; production health stays healthy.
- Restart demo API/worker and confirm active sessions remain valid, pending simulated work recovers, and expired workspaces are cleaned.

## Security checklist

- [ ] Production data is absent from all demo pages and API responses.
- [ ] Normal and demo database, Redis, queue prefix, cookies, storage bucket/prefix, API, and worker are distinct.
- [ ] Real email and webhook network delivery do not occur.
- [ ] Mailbox setup, user invitations, role/permission changes, integrations, imports, exports, organization/security changes, and password-reset delivery are blocked server-side.
- [ ] Attachments are tenant-scoped, signature-checked, size/count-limited, stored in demo storage, and removed by cleanup.
- [ ] No response/log exposes passwords, tokens, secrets, authorization headers, message bodies, connection URLs, or stack traces.
