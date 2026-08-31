export type DependencyStatus = 'connected' | 'disconnected';

export interface HealthResponse {
  status: 'ok' | 'degraded';
  services: {
    api: 'connected';
    database: DependencyStatus;
    redis: DependencyStatus;
  };
  timestamp: string;
}
