import { describe, expect, it } from 'vitest';
import {
  isQueueEmailSubmitDisabled,
  mergeQueuedEmailHistory,
  shouldPollEmailHistory,
  shouldRefreshRelatedCrmActivity,
} from '../../web/src/lib/email-status';

describe('Milestone 13 email delivery status UX', () => {
  it('shows a queued email in history immediately after queueing', () => {
    expect(
      mergeQueuedEmailHistory(
        [
          { id: 'sent-message', status: 'SENT' },
          { id: 'old-queued-message', status: 'QUEUED' },
        ],
        { id: 'new-queued-message', status: 'QUEUED' },
      ),
    ).toEqual([
      { id: 'new-queued-message', status: 'QUEUED' },
      { id: 'sent-message', status: 'SENT' },
      { id: 'old-queued-message', status: 'QUEUED' },
    ]);
  });

  it('enables temporary polling while a queued email is visible', () => {
    expect(
      shouldPollEmailHistory({
        data: [{ id: 'queued-message', status: 'QUEUED' }],
      }),
    ).toBe(2500);
  });

  it('stops polling when all visible emails are sent', () => {
    expect(
      shouldPollEmailHistory({
        data: [{ id: 'sent-message', status: 'SENT' }],
      }),
    ).toBe(false);
  });

  it('stops polling when all visible emails are failed', () => {
    expect(
      shouldPollEmailHistory({
        data: [{ id: 'failed-message', status: 'FAILED' }],
      }),
    ).toBe(false);
  });

  it('keeps queue email submission disabled during an active request', () => {
    expect(isQueueEmailSubmitDisabled(true, true)).toBe(true);
    expect(isQueueEmailSubmitDisabled(true, false)).toBe(false);
  });

  it('refreshes related CRM activity when a pending email becomes sent', () => {
    expect(
      shouldRefreshRelatedCrmActivity(
        [{ id: 'message', status: 'SENDING' }],
        [{ id: 'message', status: 'SENT' }],
      ),
    ).toBe(true);
  });
});
