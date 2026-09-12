# Milestone 14 — Two-Way Mailbox Integration V1

Goal:
Allow each UniCRM organization to connect existing email mailboxes and synchronize
incoming/outgoing conversations with CRM records.

Build on Milestone 13 email infrastructure.

Do NOT build shared-inbox assignment, Gmail OAuth, Microsoft Graph, email hosting,
marketing campaigns, newsletters, AI email, or mailbox provisioning.

## 1. Mailbox Connections

Add organization-scoped mailbox connections.

Suggested model:

MailboxConnection

- id
- organizationId
- name
- emailAddress
- displayName
- status
- incomingProtocol
- imapHost
- imapPort
- imapSecure
- smtpHost
- smtpPort
- smtpSecure
- username
- encryptedCredential
- lastSyncedAt
- syncCursor/state
- createdAt
- updatedAt

Support multiple mailboxes per organization.

Example:

- sales@unicodeit.com
- info@unicodeit.com
- contact@unicodeit.com

Use the existing encrypted-secret architecture.

Never return stored mailbox passwords to the frontend.

## 2. Provider-Neutral V1

V1 supports standard:

IMAP
→ receiving/synchronization

SMTP
→ sending

Do not implement Gmail API/OAuth or Microsoft Graph yet.

Those can be provider-specific extensions later.

## 3. Mailbox Settings UI

Add:

Settings
→ Email
→ Mailboxes

Support:

- connect mailbox
- test IMAP connection
- test SMTP connection
- enable/disable
- edit non-secret settings
- replace credential
- sync now
- last sync/status/error display

Do not expose passwords after saving.

## 4. Incoming Email Sync

Use BullMQ worker.

Flow:

Mailbox
→ IMAP
→ fetch new messages
→ persist safely
→ thread
→ CRM matching
→ display in UniCRM

Use incremental synchronization.

Track IMAP state correctly using concepts such as UID/UIDVALIDITY or equivalent
supported by the chosen library.

Do not download the whole mailbox every sync.

Use a reasonable recurring sync interval.

No WebSocket/IMAP-IDLE requirement for V1.

## 5. Email Message Model

Extend/reuse existing EmailMessage architecture where clean.

Support direction:

INBOUND
OUTBOUND

Store approximately:

- mailboxConnectionId
- organizationId
- direction
- externalMessageId / Message-ID
- threadId
- from
- to
- cc
- subject
- text/body
- receivedAt
- sentAt
- status
- relatedEntityType nullable
- relatedEntityId nullable
- createdAt

Avoid duplicate inbound messages.

Use RFC Message-ID plus provider/mailbox identifiers where necessary.

## 6. Email Threading

Add/use EmailThread.

Thread incoming/outgoing messages using standard headers:

Message-ID
In-Reply-To
References

Do not rely only on subject text.

A thread should show chronological conversation:

Customer
→ UniCRM

UniCRM
→ Customer

Customer
→ UniCRM

## 7. CRM Matching

For inbound email, attempt tenant-safe matching using sender email.

Matching order:

1. Contact email
2. Lead email
3. relevant Company email only where appropriate

If exactly one valid CRM record matches:
→ associate automatically.

If ambiguous:
→ leave unmatched.

Do not guess.

Do not automatically create a Lead or Contact from unmatched mail in this milestone.

## 8. Record Email Timeline

Lead/Contact/Company pages should show both:

Incoming
Outgoing

Example:

← John Smith
Re: Website proposal
10:42

→ Hossain
Website proposal
Yesterday

Reuse the existing Email history/activity UI where possible.

## 9. Inbox UI

Add a simple mailbox view:

Email / Inbox

Mailbox selector:
sales@unicodeit.com

Views:

- Inbox
- Sent
- Unmatched

Show:

Sender
Subject
Preview
Related CRM record
Date/time

Keep it compact and email-client-like.

Do NOT build assignment/status/team collaboration yet.

That belongs to Shared Inbox milestone.

## 10. Email Detail / Thread View

Opening a message/thread should show:

Conversation
Participants
Related CRM record
Reply action

Allow linking an unmatched thread manually to:

- Lead
- Contact
- Company

Tenant validation is mandatory.

## 11. Reply From UniCRM

Allow replying to an inbound message.

Use the connected mailbox SMTP configuration.

Preserve threading headers:

In-Reply-To
References

Flow:

Open inbound message
→ Reply
→ queue with BullMQ
→ SMTP through selected mailbox
→ EmailMessage OUTBOUND
→ same thread

Reuse Milestone 13 delivery/retry architecture.

## 12. Sender Selection

When composing/replying, allow authorized users to choose from connected active mailboxes.

Example:

From:
sales@unicodeit.com

Do not allow arbitrary spoofed From addresses.

From address must belong to an authorized MailboxConnection.

## 13. Outbound + Sent Sync Deduplication

If UniCRM sends an email and the same message later appears in the IMAP Sent folder,
do not create a duplicate EmailMessage.

Use Message-ID/provider identifiers for deduplication.

## 14. Attachments

Support basic email attachments if the existing storage abstraction allows it cleanly.

Store attachments through existing secure S3/local storage abstraction.

Enforce:

- size limits
- permission checks
- tenant isolation
- filename/MIME protections

If attachment support substantially expands scope, inbound attachment persistence may
be limited but must be documented.

## 15. Permissions

Add only necessary permissions:

mailbox.read
mailbox.manage
mail.read
mail.send
mail.link

Suggested:
Owner/Admin → full
Manager → read/send/link
Staff → read/send where allowed
Viewer → read only or none according to policy

Backend authoritative.

## 16. Security

Required:

- encrypted mailbox credentials
- no credential logging
- TLS validation
- tenant isolation
- connection timeouts
- bounded message size
- header injection protection
- sender authorization
- secure attachment handling
- sanitized safe error summaries

Never expose raw IMAP/SMTP credentials through API/UI.

Do not disable TLS certificate validation in production.

## 17. Background Sync

Use existing BullMQ worker.

Jobs:

mailbox-sync
mailbox-recovery

Ensure:

- idempotency
- bounded retries
- exponential backoff
- no overlapping sync for same mailbox
- failed sync visibility
- graceful worker shutdown

## 18. Sync Failures

Mailbox should expose status:

CONNECTED
SYNCING
ERROR
DISABLED

Show safe error examples:

Authentication failed
Connection timeout
TLS error

Never expose passwords or raw connection strings.

## 19. Activity Integration

Inbound email linked to a CRM record should create meaningful activity:

Email received
Re: Website proposal
From: john@example.com

Outbound behavior continues from Milestone 13.

Avoid duplicate activity entries.

## 20. Tests

Add high-value tests:

- mailbox credential encryption/redaction
- IMAP connection validation
- SMTP connection validation
- inbound message sync
- duplicate prevention
- incremental sync
- thread creation
- In-Reply-To / References threading
- Contact matching
- Lead matching
- ambiguous match remains unmatched
- manual linking
- reply via connected mailbox
- sent-sync deduplication
- tenant isolation
- permission denial
- worker retry/recovery

Preserve all previous tests.

## 21. Manual Acceptance

Use a development/test IMAP+SMTP mailbox server or safe test mailbox.

Verify:

1. Connect mailbox.
2. IMAP test succeeds.
3. SMTP test succeeds.
4. Send external email into mailbox.
5. Run/wait for sync.
6. Email appears in UniCRM Inbox.
7. Sender matches existing Contact.
8. Message appears on Contact email history.
9. Open message and Reply.
10. Outbound message sends via connected SMTP.
11. Reply stays in same thread.
12. Sent message is not duplicated by later Sent-folder sync.
13. Send mail from unknown address.
14. Confirm it appears under Unmatched.
15. Manually link it to a Lead/Contact.
16. Disable mailbox and verify sync stops.
17. Test invalid credentials and safe ERROR state.

Important:
Mailpit is SMTP-only and is not sufficient for testing inbound IMAP synchronization.
Use an IMAP-capable development/test mailbox environment.

## 22. Do NOT Implement

Do not implement:

- mailbox/domain hosting
- creating sales@company.com accounts
- Gmail OAuth/API
- Microsoft Graph/OAuth
- shared inbox ownership
- conversation assignment
- SLA/status workflow
- internal shared-inbox notes
- email campaigns
- newsletters
- bulk marketing
- tracking pixels
- AI email features

Those belong to later milestones.

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
- BullMQ mailbox worker
- IMAP inbound synchronization
- SMTP reply
- duplicate prevention

Stop after Milestone 14.

Completion report only:

1. models/migrations
2. mailbox architecture
3. IMAP sync strategy
4. SMTP/reply strategy
5. threading
6. CRM matching
7. inbox/thread UI
8. credential/security handling
9. BullMQ jobs
10. permissions
11. tests/validation
12. known limitations
