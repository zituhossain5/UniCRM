export type EmailDeliveryStatus = 'QUEUED' | 'SENDING' | 'SENT' | 'FAILED';

export type EmailStatusSnapshot = {
  id: string;
  status: EmailDeliveryStatus;
};

export type EmailHistoryResponse<T extends EmailStatusSnapshot = EmailStatusSnapshot> = {
  data: T[];
};

const activeStatuses = new Set<EmailDeliveryStatus>(['QUEUED', 'SENDING']);
const terminalStatuses = new Set<EmailDeliveryStatus>(['SENT', 'FAILED']);

export function hasActiveEmailDelivery(messages: readonly EmailStatusSnapshot[]): boolean {
  return messages.some((message) => activeStatuses.has(message.status));
}

export function shouldPollEmailHistory(history: EmailHistoryResponse | undefined): false | number {
  return history && hasActiveEmailDelivery(history.data) ? 2500 : false;
}

export function shouldRefreshRelatedCrmActivity(
  previous: readonly EmailStatusSnapshot[],
  current: readonly EmailStatusSnapshot[],
): boolean {
  const previousStatuses = new Map(previous.map((message) => [message.id, message.status]));
  return current.some((message) => {
    const previousStatus = previousStatuses.get(message.id);
    return (
      previousStatus !== undefined &&
      activeStatuses.has(previousStatus) &&
      terminalStatuses.has(message.status)
    );
  });
}

export function mergeQueuedEmailHistory<T extends EmailStatusSnapshot>(
  current: readonly T[] | undefined,
  queued: T,
): T[] {
  return [queued, ...(current ?? []).filter((message) => message.id !== queued.id)];
}

export function isQueueEmailSubmitDisabled(hasSenderIdentity: boolean, submissionPending: boolean) {
  return !hasSenderIdentity || submissionPending;
}
