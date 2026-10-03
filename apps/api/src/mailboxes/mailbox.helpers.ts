import type { ParsedMail } from 'mailparser';

export type MailboxSyncStage =
  | 'decrypt-credential'
  | 'connect'
  | 'list-folders'
  | 'open-inbox'
  | 'fetch-inbox'
  | 'parse-message'
  | 'persist-message'
  | 'persist-attachment'
  | 'open-sent'
  | 'fetch-sent'
  | 'update-state';

export class MailboxSyncError extends Error {
  readonly stage: MailboxSyncStage;

  constructor(stage: MailboxSyncStage, cause: unknown) {
    super(errorMessage(cause), { cause });
    this.name = 'MailboxSyncError';
    this.stage = stage;
  }
}

export type SafeMailboxErrorDetails = {
  name: string;
  code?: string;
  message: string;
  stage?: MailboxSyncStage;
};

export type MailboxSyncState = {
  folders?: Record<string, { uidValidity: string; lastUid: number }>;
};

export function nextUidRange(input: {
  currentUidValidity: string;
  exists: number;
  uidNext: number;
  previous?: { uidValidity: string; lastUid: number };
  batchSize: number;
}) {
  if (!input.exists) return null;
  if (input.previous?.uidValidity === input.currentUidValidity) {
    return input.previous.lastUid >= input.uidNext - 1 ? null : `${input.previous.lastUid + 1}:*`;
  }
  return `${Math.max(1, input.uidNext - input.batchSize)}:*`;
}

export function normalizeEmail(value: string | undefined | null) {
  const normalized = value?.trim().toLowerCase();
  return normalized && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : undefined;
}

export function normalizeMessageId(value: string | undefined | null) {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, 998) : undefined;
}

export function normalizeReferences(mail: Pick<ParsedMail, 'references' | 'inReplyTo'>) {
  const references = Array.isArray(mail.references)
    ? mail.references
    : mail.references
      ? [mail.references]
      : [];
  return [...new Set([...references, ...(mail.inReplyTo ? [mail.inReplyTo] : [])])]
    .map(normalizeMessageId)
    .filter((value): value is string => Boolean(value));
}

export function safeFileName(value: string) {
  const cleaned = [...value]
    .filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
    .join('')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim()
    .slice(0, 255);
  return cleaned || 'attachment';
}

export function mailboxSyncError(error: unknown, stage: MailboxSyncStage) {
  return error instanceof MailboxSyncError ? error : new MailboxSyncError(stage, error);
}

export function safeMailboxError(error: unknown, fallbackStage?: MailboxSyncStage) {
  const details = safeMailboxErrorDetails(error, fallbackStage);
  const value = `${details.name} ${details.code ?? ''} ${details.message}`;
  if (/auth|credential|login|password/i.test(value)) return 'Authentication failed';
  if (/timeout|timed out|CONNECT_TIMEOUT/i.test(value)) return 'Connection timeout';
  if (/tls|certificate|ssl/i.test(value)) return 'TLS error';
  if (
    details.stage === 'list-folders' ||
    details.stage === 'open-inbox' ||
    details.stage === 'open-sent'
  )
    return 'Mailbox folder error';
  if (details.stage === 'persist-attachment') return 'Attachment synchronization failed';
  if (
    details.stage === 'fetch-inbox' ||
    details.stage === 'fetch-sent' ||
    details.stage === 'parse-message' ||
    details.stage === 'persist-message'
  )
    return 'Message synchronization failed';
  return 'Mailbox synchronization failed';
}

export function safeMailboxErrorDetails(
  error: unknown,
  fallbackStage?: MailboxSyncStage,
): SafeMailboxErrorDetails {
  const wrapped = error instanceof MailboxSyncError ? error : undefined;
  const cause = wrapped?.cause ?? error;
  const record =
    cause && typeof cause === 'object' ? (cause as Record<string, unknown>) : undefined;
  const rawCode = record?.code;
  const code =
    typeof rawCode === 'string' && /^[A-Za-z0-9_.-]{1,80}$/.test(rawCode) ? rawCode : undefined;
  const name = cause instanceof Error ? sanitizeText(cause.name, 80) : 'Error';
  const message =
    name.startsWith('PrismaClient') || (code?.startsWith('P') && /^P\d{4}$/.test(code))
      ? `Database operation failed${code ? ` (${code})` : ''}`
      : sanitizeText(errorMessage(cause), 500);
  return { name, ...(code ? { code } : {}), message, stage: wrapped?.stage ?? fallbackStage };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Mailbox operation failed';
}

function sanitizeText(value: string, maxLength: number) {
  const withoutControlCharacters = [...value]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 ? ' ' : character;
    })
    .join('');
  return (
    withoutControlCharacters
      .replace(
        /\b(password|pass|credential|authorization|token|secret)\s*[:=]\s*[^\s,;]+/gi,
        '$1=[redacted]',
      )
      .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[redacted]@')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLength) || 'Mailbox operation failed'
  );
}
