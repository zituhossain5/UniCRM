export type CaseStatus =
  'OPEN' | 'IN_PROGRESS' | 'WAITING_FOR_CUSTOMER' | 'WAITING_INTERNAL' | 'RESOLVED' | 'CLOSED';
export type CasePriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type CaseType =
  'GENERAL_INQUIRY' | 'TECHNICAL_ISSUE' | 'SERVICE_REQUEST' | 'BILLING' | 'COMPLAINT' | 'OTHER';
export type PersonSummary = { id: string; firstName: string; lastName: string; status?: string };

export type CustomerCase = {
  id: string;
  organizationId: string;
  caseNumber: string;
  title: string;
  description: string | null;
  type: CaseType;
  status: CaseStatus;
  priority: CasePriority;
  contactId: string | null;
  companyId: string | null;
  leadId: string | null;
  dealId: string | null;
  sourceThreadId: string | null;
  assignedUserId: string | null;
  dueAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  assignedUser: PersonSummary | null;
  createdBy: PersonSummary;
  contact: (PersonSummary & { email?: string | null }) | null;
  company: { id: string; name: string } | null;
  lead: { id: string; title: string } | null;
  deal: { id: string; name: string } | null;
  sourceThread: { id: string; subject: string } | null;
  _count: { comments: number; tasks: number; attachments: number };
  comments?: Array<{ id: string; content: string; createdAt: string; author: PersonSummary }>;
  tasks?: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    dueDate: string | null;
    assignee: PersonSummary | null;
  }>;
  attachments?: Array<{
    id: string;
    fileName: string;
    mimeType: string;
    size: number;
    createdAt: string;
    uploadedBy: PersonSummary;
  }>;
  activity?: Array<{
    id: string;
    action: string;
    metadata: unknown;
    createdAt: string;
    actor: PersonSummary | null;
  }>;
};

export const caseStatuses: CaseStatus[] = [
  'OPEN',
  'IN_PROGRESS',
  'WAITING_FOR_CUSTOMER',
  'WAITING_INTERNAL',
  'RESOLVED',
  'CLOSED',
];
export const casePriorities: CasePriority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
export const caseTypes: CaseType[] = [
  'GENERAL_INQUIRY',
  'TECHNICAL_ISSUE',
  'SERVICE_REQUEST',
  'BILLING',
  'COMPLAINT',
  'OTHER',
];
export const caseLabel = (value: string) =>
  value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/^./, (x) => x.toUpperCase());
