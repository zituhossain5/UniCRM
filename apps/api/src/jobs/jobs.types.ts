export const UNICRM_QUEUE = 'unicrm';

export type EmailJob = {
  subject: string;
  text: string;
  to: string;
};

export type IntegrationEventJob = { eventId: string };
export type WebhookDeliveryJob = { deliveryId: string };
export type AutomationRunJob = { runId: string };
export type CrmEmailJob = { messageId: string };
export type MailboxSyncJob = { mailboxId: string };
