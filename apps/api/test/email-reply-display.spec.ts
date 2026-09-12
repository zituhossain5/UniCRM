import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { splitEmailReplyBody } from '../../web/src/lib/email-reply';

describe('Shared Inbox reply display parsing', () => {
  it('separates a Gmail-style On ... wrote reply', () => {
    const result = splitEmailReplyBody(
      [
        'Thank you for your response.',
        '',
        'On Sat, 12 Sept 2026 at 15:20, Unicode IT <contact@unicodeit.com> wrote:',
        '> Reply sent from UniCRM.',
      ].join('\n'),
    );
    expect(result.visibleBody).toBe('Thank you for your response.');
    expect(result.quotedBody).toContain('Reply sent from UniCRM.');
  });

  it('separates nested trailing quote lines', () => {
    const result = splitEmailReplyBody('New response\n\n> Earlier response\n>> Original message');
    expect(result).toEqual({
      visibleBody: 'New response',
      quotedBody: '> Earlier response\n>> Original message',
    });
  });

  it('separates an Outlook-style quoted header block', () => {
    const result = splitEmailReplyBody(
      [
        'Here is the requested update.',
        '',
        'From: Mail Tester <tester@example.com>',
        'Sent: Saturday, September 12, 2026 3:20 PM',
        'To: Unicode IT <contact@unicodeit.com>',
        'Subject: UniCRM IMAP Acceptance Test',
        '',
        'Earlier message.',
      ].join('\n'),
    );
    expect(result.visibleBody).toBe('Here is the requested update.');
    expect(result.quotedBody).toContain('From: Mail Tester');
  });

  it('leaves a message without quoted content unchanged', () => {
    expect(splitEmailReplyBody('This is a complete standalone message.')).toEqual({
      visibleBody: 'This is a complete standalone message.',
      quotedBody: null,
    });
  });

  it('does not remove a legitimate single greater-than line', () => {
    const body = 'The threshold is:\n> 100 customers\nPlease confirm.';
    expect(splitEmailReplyBody(body)).toEqual({ visibleBody: body, quotedBody: null });
  });

  it('does not mutate or destructively replace the original body', () => {
    const original = 'Fresh text\n\n> Old text\n>> Older text';
    const preserved = original;
    const result = splitEmailReplyBody(original);
    expect(original).toBe(preserved);
    expect(result.visibleBody).toBe('Fresh text');
    expect(result.quotedBody).toBe('> Old text\n>> Older text');
  });

  it('renders quoted text as a collapsed expandable region', () => {
    const source = readFileSync(
      join(process.cwd(), '../web/src/components/mail/email-thread-sheet.tsx'),
      'utf8',
    );
    expect(source).toContain('<details className="thread-message-quote">');
    expect(source).toContain('Show quoted text');
    expect(source).toContain('Hide quoted text');
  });

  it('preserves incoming and outgoing message presentation', () => {
    const source = readFileSync(
      join(process.cwd(), '../web/src/components/mail/email-thread-sheet.tsx'),
      'utf8',
    );
    expect(source).toContain('thread-message--${message.direction.toLowerCase()}');
    expect(source).toMatch(/message\.direction === 'INBOUND'\s*\?\s*'INCOMING'/);
    expect(source).toContain('OUTGOING');
  });
});
