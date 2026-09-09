export type AutomationEntityType = 'LEAD' | 'PROJECT' | 'TASK' | 'QUOTATION' | 'PAYMENT';

export type AutomationTriggerType =
  | 'LEAD_CREATED'
  | 'LEAD_STAGE_CHANGED'
  | 'LEAD_OWNER_CHANGED'
  | 'PROJECT_CREATED'
  | 'PROJECT_STATUS_CHANGED'
  | 'TASK_CREATED'
  | 'TASK_STATUS_CHANGED'
  | 'TASK_OVERDUE'
  | 'QUOTATION_CREATED'
  | 'QUOTATION_STATUS_CHANGED'
  | 'PAYMENT_CREATED';

export type AutomationCondition = {
  field: string;
  operator: string;
  value?: string | number | boolean;
  fieldDefinitionId?: string;
};

export type AutomationAction = {
  type: string;
  title?: string;
  message?: string;
  notes?: string;
  tagId?: string;
  ownerId?: string;
  webhookSubscriptionId?: string;
  priority?: string;
  followUpType?: string;
  dueInDays?: number;
};

export type AutomationRule = {
  id: string;
  name: string;
  entityType: AutomationEntityType;
  triggerType: AutomationTriggerType;
  triggerConfig: { from?: string; to?: string } | null;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  active: boolean;
  createdAt: string;
};

export type AutomationRun = {
  id: string;
  triggerEventId: string;
  entityType: AutomationEntityType;
  entityId: string;
  entityLabel?: string;
  status: 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'SKIPPED' | 'FAILED';
  attemptCount: number;
  retryable: boolean;
  errorSummary: string | null;
  triggerSummary?: string;
  actionSummary?: string;
  conditionSummaries?: string[];
  actionSummaries?: string[];
  actionResults: Array<{
    index: number;
    type: string;
    status: 'SUCCEEDED' | 'FAILED' | 'SKIPPED';
    summary: string;
    completedAt: string;
  }> | null;
  createdAt: string;
  startedAt?: string | null;
  completedAt: string | null;
};
