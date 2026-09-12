# Milestone 15 — Shared Inbox & Team Collaboration

Goal:
Turn connected Milestone 14 mailboxes into collaborative shared inboxes for teams.

Build on the existing MailboxConnection, EmailThread, EmailMessage, CRM matching,
BullMQ, SMTP/IMAP, permissions, and threading architecture.

Do NOT implement email hosting, Gmail/Outlook OAuth, campaigns, newsletters,
AI replies, or ecommerce-specific behavior.

## 1. Conversation State

Extend EmailThread or add a lightweight shared-inbox state model supporting:

- UNASSIGNED
- OPEN
- WAITING
- RESOLVED
- CLOSED

Also support:

- assignedUserId nullable
- priority: LOW / NORMAL / HIGH / URGENT
- unread/read state
- dueAt nullable
- resolvedAt nullable

Do not duplicate email/thread data.

## 2. Assignment

Allow authorized users to:

- assign conversation to self
- assign to another organization user
- unassign

Only same-organization active users are valid.

Record assignment history.

## 3. Shared Inbox UI

Use `/app/email` as the shared inbox workspace.

Support:

- Inbox
- Unassigned
- Mine
- Open
- Waiting
- Resolved
- Unmatched

Filters:

- mailbox
- assignee
- status
- priority
- unread/read

Keep the UI compact and email-client-like.

## 4. Conversation List

Show:

- sender
- subject
- preview
- mailbox
- assignee
- status
- priority
- unread state
- last message time
- related CRM record

Do not use large cards.

## 5. Conversation Detail

Thread view should include:

- chronological email messages
- reply composer
- attachments
- CRM link
- status
- assignee
- priority
- due date
- internal notes

Reuse existing Milestone 14 thread/reply component.

## 6. Internal Notes

Add team-only notes to a conversation.

Suggested model:

ConversationNote

- id
- organizationId
- threadId
- authorUserId
- content
- createdAt
- updatedAt

Notes must never be sent by email.

Clearly distinguish:
Internal note
vs
Email reply

## 7. Collaboration History

Track meaningful events:

- assigned
- reassigned
- unassigned
- status changed
- priority changed
- note added
- linked to CRM record
- resolved/reopened

Avoid noisy logging.

## 8. Email → CRM Actions

From an email thread allow:

- Create Lead
- Create Task
- Link to existing Lead
- Link to existing Contact
- Link to existing Company

Use existing CRM APIs/services.

Do not duplicate lead/task creation logic.

## 9. Create Lead From Email

Prefill where possible:

- sender name
- sender email
- subject
- source = Email
- notes/context

User must review before creating.

Do not automatically create Leads from all incoming emails.

## 10. Create Task From Email

Allow:

- title prefilled from subject
- description/context
- project optional
- assignee
- due date
- priority

User reviews before creation.

## 11. Notifications

Create in-app notifications for:

- conversation assigned to user
- high/urgent priority assignment
- due conversation approaching/overdue

Avoid notification spam.

Reuse existing Notifications/BullMQ infrastructure.

## 12. SLA Foundation

V1 only needs dueAt / overdue behavior.

Support:

- set due date/time
- overdue indicator
- due-soon query/filter

Do NOT build configurable enterprise SLA policies yet.

## 13. Permissions

Add only necessary permissions:

inbox.read
inbox.assign
inbox.reply
inbox.note
inbox.status.update
inbox.priority.update

Reuse mail.read/mail.send/mail.link where appropriate.

Owner/Admin → full
Manager → broad inbox management
Staff → read/reply/note/assignment according to policy
Viewer → read-only or none

Backend authoritative.

## 14. Tenant Isolation

Strictly enforce tenant isolation for:

- threads
- assignments
- notes
- users
- CRM links
- task/lead creation
- mailbox access

## 15. Tests

Add high-value tests for:

- assign/unassign
- self-assignment
- invalid cross-tenant assignee
- status changes
- priority changes
- internal notes
- note isolation from outgoing email
- Create Lead from email
- Create Task from email
- unread/read
- Mine/Unassigned filters
- resolved/reopen
- notification on assignment
- permissions
- tenant isolation

Preserve all previous tests.

## 16. Manual Acceptance

Use contact@unicodeit.com.

1. Send external email to contact@unicodeit.com.
2. Sync.
3. Confirm it appears under Unassigned.
4. Assign to yourself.
5. Confirm it appears under Mine.
6. Add internal note.
7. Reply from UniCRM.
8. Change status to Waiting.
9. Receive reply from sender.
10. Change status to Open.
11. Create a Lead from the thread.
12. Create a Task from the thread.
13. Set High priority.
14. Set due time.
15. Resolve conversation.
16. Reopen it.
17. Verify collaboration history.
18. Verify sender never receives internal notes.

## Do NOT Implement

- Gmail OAuth
- Microsoft Graph
- mailbox hosting
- email campaigns
- newsletters
- AI responses
- chatbot
- ecommerce support cases
- advanced SLA rules
- omnichannel messaging

## Validation

Run:

pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check

Also verify:

- Prisma generate
- current migration
- fresh migration
- BullMQ notifications
- real mailbox round-trip

Stop after Milestone 15.

Completion report only:

1. models/migrations
2. shared inbox state
3. assignment workflow
4. internal notes
5. CRM conversion actions
6. notification/SLA behavior
7. permissions/security
8. tests/validation
9. known limitations
