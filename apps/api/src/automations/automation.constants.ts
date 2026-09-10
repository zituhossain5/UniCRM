export const AUTOMATION_EXECUTION_JOB = 'automation-execution';
export const AUTOMATION_RECOVERY_JOB = 'automation-recovery';
export const AUTOMATION_MAX_DEPTH = 5;
export const AUTOMATION_MAX_ATTEMPTS = 3;

export const AUTOMATION_EVENT_MAP = {
  'lead.created': { entityType: 'LEAD', triggerType: 'LEAD_CREATED' },
  'lead.stage_changed': { entityType: 'LEAD', triggerType: 'LEAD_STAGE_CHANGED' },
  'lead.owner_changed': { entityType: 'LEAD', triggerType: 'LEAD_OWNER_CHANGED' },
  'project.created': { entityType: 'PROJECT', triggerType: 'PROJECT_CREATED' },
  'project.status_changed': { entityType: 'PROJECT', triggerType: 'PROJECT_STATUS_CHANGED' },
  'task.created': { entityType: 'TASK', triggerType: 'TASK_CREATED' },
  'task.status_changed': { entityType: 'TASK', triggerType: 'TASK_STATUS_CHANGED' },
  'task.overdue': { entityType: 'TASK', triggerType: 'TASK_OVERDUE' },
  'quotation.created': { entityType: 'QUOTATION', triggerType: 'QUOTATION_CREATED' },
  'quotation.status_changed': {
    entityType: 'QUOTATION',
    triggerType: 'QUOTATION_STATUS_CHANGED',
  },
  'payment.created': { entityType: 'PAYMENT', triggerType: 'PAYMENT_CREATED' },
} as const;

export type AutomationEventType = keyof typeof AUTOMATION_EVENT_MAP;

export const CONDITION_FIELDS = [
  'status',
  'stageId',
  'ownerId',
  'priority',
  'tagIds',
  'pipelineId',
  'amount',
  'estimatedValue',
  'customField',
] as const;

export const CONDITION_OPERATORS = [
  'EQUALS',
  'NOT_EQUALS',
  'CONTAINS',
  'GREATER_THAN',
  'LESS_THAN',
  'IS_EMPTY',
  'IS_NOT_EMPTY',
] as const;

export const ACTION_TYPES = [
  'CREATE_TASK',
  'CREATE_FOLLOW_UP',
  'ADD_TAG',
  'REMOVE_TAG',
  'ASSIGN_OWNER',
  'CHANGE_PRIORITY',
  'CREATE_NOTIFICATION',
  'TRIGGER_WEBHOOK',
  'SEND_EMAIL',
] as const;
