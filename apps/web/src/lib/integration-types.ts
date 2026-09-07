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
