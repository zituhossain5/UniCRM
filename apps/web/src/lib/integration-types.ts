export interface IntegrationConnection {
  id: string;
  name: string;
  provider: string;
  status: string;
  direction: string;
  configuration: Record<string, unknown> | null;
  secretLastFour: string;
  secretRotatedAt: string;
  lastActivityAt: string | null;
  createdAt: string;
}

export interface WebhookSubscription {
  id: string;
  connectionId: string;
  name: string;
  targetUrl: string;
  secretLastFour: string;
  active: boolean;
  eventTypes: string[];
  createdAt: string;
}

export interface IntegrationEventRecord {
  id: string;
  direction: string;
  eventType: string;
  status: string;
  attemptCount: number;
  retryable: boolean;
  lastError: string | null;
  createdAt: string;
}

export interface WebhookDeliveryRecord {
  id: string;
  eventType: string;
  status: string;
  attempt: number;
  statusCode: number | null;
  retryable: boolean;
  lastError: string | null;
  createdAt: string;
}

export interface WebToLeadMapping {
  sourceField?: string;
  fixedValue?: unknown;
  target: string;
  targetId?: string;
}

export interface WebToLeadIntegration {
  id: string;
  sourceKey: string;
  defaultPipelineId: string;
  defaultStageId: string;
  defaultOwnerId: string | null;
  defaultPriority: string;
  defaultTagIds: string[];
  defaultTags: Array<{ id: string; name: string }>;
  mappings: WebToLeadMapping[];
  active: boolean;
  endpoint: string;
  lastSubmissionAt: string | null;
  successfulSubmissions: number;
  failedSubmissions: number;
  createdAt: string;
  connection: {
    id: string;
    name: string;
    status: string;
    secretLastFour: string;
    secretRotatedAt: string;
    lastActivityAt: string | null;
  };
  defaultPipeline: { id: string; name: string };
  defaultStage: { id: string; name: string };
  defaultOwner: { id: string; firstName: string; lastName: string; email: string } | null;
}

export interface WebToLeadReferences {
  pipelines: Array<{
    id: string;
    name: string;
    stages: Array<{ id: string; name: string; position: number }>;
  }>;
  users: Array<{ id: string; firstName: string; lastName: string; email: string }>;
  tags: Array<{ id: string; name: string }>;
  customFields: Array<{
    id: string;
    key: string;
    name: string;
    fieldType: string;
    required: boolean;
  }>;
}

export interface WebToLeadLog {
  id: string;
  submissionId: string | null;
  status: string;
  leadId: string | null;
  receivedAt: string;
  processedAt: string | null;
  lastError: string | null;
  event: { id: string; attemptCount: number; retryable: boolean };
}
