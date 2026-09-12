import type { ParsedMail } from 'mailparser';

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

export function safeMailboxError(error: unknown) {
  const value =
    error instanceof Error ? `${error.name} ${error.message}` : 'Mailbox operation failed';
  if (/auth|credential|login|password/i.test(value)) return 'Authentication failed';
  if (/timeout|timed out|CONNECT_TIMEOUT/i.test(value)) return 'Connection timeout';
  if (/tls|certificate|ssl/i.test(value)) return 'TLS error';
  return 'Mailbox connection failed';
}
