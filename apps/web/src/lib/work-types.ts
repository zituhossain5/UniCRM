import type { CompanyRef, PaginationMeta, PersonRef } from './crm-types';

export interface ProjectRef {
  id: string;
  name: string;
  status: string;
}

export interface ProjectMember {
  id: string;
  role: string | null;
  createdAt: string;
  user: PersonRef;
}

export interface ProjectRecord extends ProjectRef {
  companyId: string;
  sourceLeadId: string | null;
  projectManagerId: string | null;
  description: string | null;
  priority: string;
  startDate: string | null;
  deadline: string | null;
  projectValue: string | null;
  currency: string;
  progress: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  company: CompanyRef;
  projectManager: PersonRef | null;
  createdBy?: PersonRef;
  sourceLead?: { id: string; title: string; stage: { name: string; isWon: boolean } } | null;
  members?: ProjectMember[];
  activity?: WorkActivity[];
  financials?: {
    projectValue: string;
    quotedAmount: string;
    received: string;
    outstanding: string;
  };
  quotations?: Array<{
    id: string;
    quotationNumber: string;
    status: string;
    total: string;
    currency: string;
  }>;
  payments?: Array<{
    id: string;
    amount: string;
    currency: string;
    paymentDate: string;
    method: string | null;
    reference: string | null;
  }>;
  _count: { members: number; tasks: number };
}

export interface TaskRecord {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  assigneeId: string | null;
  status: string;
  priority: string;
  startDate: string | null;
  dueDate: string | null;
  estimatedMinutes: number | null;
  completedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  project: ProjectRef;
  assignee: PersonRef | null;
  reporter: PersonRef;
  _count: { comments: number; attachments: number };
}

export interface TaskComment {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  user: PersonRef;
}

export interface AttachmentRecord {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  uploadedBy: PersonRef;
}

export interface WorkActivity {
  id: string;
  action: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: PersonRef | null;
}

export interface ListResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export const projectStatuses = [
  'PLANNED',
  'IN_PROGRESS',
  'ON_HOLD',
  'IN_REVIEW',
  'COMPLETED',
  'CANCELLED',
] as const;
export const taskStatuses = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED', 'BLOCKED'] as const;
export const workPriorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

export function formatDateOnly(value: string | null | undefined) {
  if (!value) return '-';
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return new Intl.DateTimeFormat('en-BD', { dateStyle: 'medium' }).format(
    new Date(year!, month! - 1, day),
  );
}
