export type MailboxStatus = 'CONNECTED' | 'SYNCING' | 'ERROR' | 'DISABLED';

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
}

export interface PaginatedMail {
  data: MailMessageSummary[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}
