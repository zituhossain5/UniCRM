export const SUPPORTED_WEBHOOK_EVENT_TYPES = [
  'lead.created',
  'lead.updated',
  'lead.stage_changed',
  'company.created',
  'company.updated',
  'contact.created',
  'contact.updated',
  'project.created',
  'project.updated',
  'task.created',
  'task.updated',
  'task.completed',
] as const;

export const SUPPORTED_WEBHOOK_EVENTS = new Set<string>(SUPPORTED_WEBHOOK_EVENT_TYPES);

export const INTEGRATION_PROCESSING_JOB = 'integration-event-processing';
export const WEBHOOK_DELIVERY_JOB = 'webhook-delivery';
export const INTEGRATION_RECOVERY_JOB = 'integration-recovery';
