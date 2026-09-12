export interface EmailReplyParts {
  visibleBody: string;
  quotedBody: string | null;
}

const replyHeader = /^\s*On\s+.+\s+wrote:\s*$/i;
const quoteLine = /^\s*>+/;
const originalMessageSeparator = /^\s*-{2,}\s*Original Message\s*-{2,}\s*$/i;
const outlookHeader = /^\s*(From|Sent|To|Subject):\s*\S+/i;

export function splitEmailReplyBody(body: string): EmailReplyParts {
  const normalized = body.replace(/\r\n?/g, '\n').trim();
  if (!normalized) return { visibleBody: '', quotedBody: null };

  const lines = normalized.split('\n');
  const boundary =
    findOriginalMessageBoundary(lines) ??
    findGmailBoundary(lines) ??
    findTrailingQuoteBoundary(lines);

  if (boundary === null) return { visibleBody: normalized, quotedBody: null };

  const visibleBody = trimBlankLines(lines.slice(0, boundary).join('\n'));
  const quotedBody = trimBlankLines(lines.slice(boundary).join('\n'));
  if (!visibleBody || !quotedBody) return { visibleBody: normalized, quotedBody: null };
  return { visibleBody, quotedBody };
}

function findOriginalMessageBoundary(lines: string[]) {
  const separator = lines.findIndex((line) => originalMessageSeparator.test(line));
  if (separator > 0) return separator;

  for (let index = 1; index < lines.length; index += 1) {
    if (!/^\s*From:\s*\S+/i.test(lines[index] ?? '')) continue;
    const candidate = lines.slice(index, index + 7).filter((line) => line.trim());
    const headers = new Set(
      candidate
        .filter((line) => outlookHeader.test(line))
        .map((line) => line.trim().split(':', 1)[0]!.toLowerCase()),
    );
    if (headers.has('from') && headers.has('subject') && (headers.has('sent') || headers.has('to')))
      return index;
  }
  return null;
}

function findGmailBoundary(lines: string[]) {
  for (let index = 1; index < lines.length; index += 1) {
    const candidates = [lines[index] ?? ''];
    if (index + 1 < lines.length) candidates.push(`${lines[index]} ${lines[index + 1]}`);
    if (index + 2 < lines.length)
      candidates.push(`${lines[index]} ${lines[index + 1]} ${lines[index + 2]}`);

    const marker = candidates.find((candidate) => replyHeader.test(candidate));
    if (!marker || !/(@|<[^>]+>|\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b)/i.test(marker)) continue;
    const following = lines.slice(index + 1).filter((line) => line.trim());
    if (following.some((line) => quoteLine.test(line))) return index;
  }
  return null;
}

function findTrailingQuoteBoundary(lines: string[]) {
  for (let index = 1; index < lines.length; index += 1) {
    if (!quoteLine.test(lines[index] ?? '')) continue;
    const remainder = lines.slice(index).filter((line) => line.trim());
    const quoted = remainder.filter((line) => quoteLine.test(line));
    if (remainder.length === quoted.length && quoted.length >= 2) return index;
  }
  return null;
}

function trimBlankLines(value: string) {
  return value.replace(/^\s*\n|\n\s*$/g, '').trimEnd();
}
