export type MailboxStatus = 'CONNECTED' | 'SYNCING' | 'ERROR' | 'DISABLED';
export type InboxThreadStatus = 'UNASSIGNED' | 'OPEN' | 'WAITING' | 'RESOLVED' | 'CLOSED';
export type InboxPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export interface InboxUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
}

export interface MailboxConnection {
  id: string;
  name: string;
  emailAddress: string;
  displayName: string | null;
  status: MailboxStatus;
  incomingProtocol: 'IMAP';
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  username: string;
  lastSyncedAt: string | null;
  safeErrorSummary: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AvailableMailbox = Pick<
  MailboxConnection,
  'id' | 'name' | 'emailAddress' | 'displayName' | 'status'
>;

export interface MailMessageSummary {
  id: string;
  threadId: string | null;
  direction: 'INBOUND' | 'OUTBOUND';
  fromName: string;
  fromAddress: string;
  toAddresses: string[];
  subject: string;
  body: string;
  status: 'QUEUED' | 'SENDING' | 'SENT' | 'FAILED';
  receivedAt: string | null;
  sentAt: string | null;
  createdAt: string;
  relatedEntityType: 'LEAD' | 'CONTACT' | 'COMPANY' | null;
  relatedEntityId: string | null;
  mailboxConnection: Pick<MailboxConnection, 'id' | 'emailAddress' | 'name'> | null;
}

export interface EmailThread {
  id: string;
  subject: string;
  inboxStatus: InboxThreadStatus;
  inboxPriority: InboxPriority;
  assignedUserId: string | null;
  assignedUser: InboxUser | null;
  isUnread: boolean;
  dueAt: string | null;
  resolvedAt: string | null;
  lastMessageAt: string;
  relatedEntityType: 'LEAD' | 'CONTACT' | 'COMPANY' | null;
  relatedEntityId: string | null;
  mailboxConnection: Pick<MailboxConnection, 'id' | 'emailAddress' | 'name' | 'status'> | null;
  messages: Array<
    MailMessageSummary & {
      ccAddresses: string[];
      safeErrorSummary: string | null;
      attachments: Array<{
        id: string;
        fileName: string;
        mimeType: string;
        size: number;
      }>;
    }
  >;
  notes: Array<{
    id: string;
    content: string;
    createdAt: string;
    updatedAt: string;
    author: InboxUser;
  }>;
  events: Array<{
    id: string;
    type:
      | 'ASSIGNED'
      | 'REASSIGNED'
      | 'UNASSIGNED'
      | 'STATUS_CHANGED'
      | 'PRIORITY_CHANGED'
      | 'DUE_AT_CHANGED'
      | 'NOTE_ADDED'
      | 'CRM_LINKED'
      | 'RESOLVED'
      | 'REOPENED';
    metadata: Record<string, unknown> | null;
    createdAt: string;
    actor: InboxUser | null;
  }>;
}

export interface InboxConversationSummary {
  id: string;
  subject: string;
  inboxStatus: InboxThreadStatus;
  inboxPriority: InboxPriority;
  assignedUserId: string | null;
  assignedUser: InboxUser | null;
  isUnread: boolean;
  dueAt: string | null;
  resolvedAt: string | null;
  lastMessageAt: string;
  relatedEntityType: 'LEAD' | 'CONTACT' | 'COMPANY' | null;
  relatedEntityId: string | null;
  mailboxConnection: Pick<MailboxConnection, 'id' | 'emailAddress' | 'name'> | null;
  messages: Array<
    Pick<
      MailMessageSummary,
      | 'id'
      | 'direction'
      | 'fromName'
      | 'fromAddress'
      | 'toAddresses'
      | 'body'
      | 'status'
      | 'receivedAt'
      | 'sentAt'
      | 'createdAt'
    >
  >;
  _count: { notes: number };
}

export interface PaginatedMail {
  data: MailMessageSummary[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface PaginatedInboxConversations {
  data: InboxConversationSummary[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}
