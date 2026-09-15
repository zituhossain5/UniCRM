import type { PersonRef } from './crm-types';

export type ActivitySource = 'SCHEDULED_ACTIVITY' | 'TASK' | 'FOLLOW_UP' | 'PROJECT_DEADLINE';
export type ActivityType = 'CALL' | 'MEETING' | 'FOLLOW_UP' | 'OTHER' | 'TASK' | 'PROJECT_DEADLINE';
export type ActivityStatus = 'PLANNED' | 'COMPLETED' | 'CANCELLED';
export type ActivityRelatedType = 'LEAD' | 'DEAL' | 'CONTACT' | 'COMPANY';

export interface ActivityRecord {
  id: string;
  source: ActivitySource;
  type: ActivityType;
  subject: string;
  description: string | null;
  owner: PersonRef | null;
  ownerId: string | null;
  startAt: string;
  endAt: string | null;
  status: ActivityStatus;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  reminderAt: string | null;
  completedAt: string | null;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  relatedRecord: { id: string; name: string } | null;
}

export interface ActivityListResponse {
  data: ActivityRecord[];
  meta: { page: number; limit: number; total: number; totalPages: number; timezone: string };
}
