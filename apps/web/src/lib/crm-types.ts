export interface PersonRef {
  id: string;
  firstName: string;
  lastName: string;
  status?: string;
}
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
export interface CompanyRef {
  id: string;
  name: string;
  status?: string;
}
export interface ContactRef {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
}
export interface Stage {
  id: string;
  name: string;
  position: number;
  isWon: boolean;
  isLost: boolean;
}
export interface Pipeline {
  id: string;
  name: string;
  isDefault: boolean;
  stages: Stage[];
}

export interface CompanyRecord {
  id: string;
  name: string;
  website: string | null;
  email: string | null;
  phone: string | null;
  industry: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  status: string;
  notes: string | null;
  accountOwner: PersonRef | null;
  contacts: Array<ContactRef & { jobTitle: string | null; isPrimary: boolean }>;
  _count: { leads: number };
  createdAt: string;
  updatedAt: string;
  activity?: Array<{ id: string; action: string; createdAt: string; actor: PersonRef | null }>;
  projects?: Array<{
    id: string;
    name: string;
    status: string;
    priority: string;
    progress: number;
    deadline: string | null;
  }>;
}

export interface ContactRecord extends ContactRef {
  company: CompanyRef | null;
  jobTitle: string | null;
  alternatePhone: string | null;
  isPrimary: boolean;
  notes: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  leads?: Array<{ id: string; title: string; stage: { name: string } }>;
}

export interface LeadActivity {
  id: string;
  type: string;
  title: string;
  description: string | null;
  occurredAt: string;
  createdBy: PersonRef | null;
  metadata?: Record<string, unknown> | null;
}
export interface FollowUp {
  id: string;
  dueAt: string;
  status: string;
  type: string;
  notes: string | null;
  assignedTo: PersonRef | null;
}
export interface LeadRecord {
  id: string;
  title: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  estimatedValue: string | null;
  currency: string;
  priority: string;
  nextFollowUpAt: string | null;
  description: string | null;
  notes: string | null;
  lostReason: string | null;
  archivedAt: string | null;
  companyId: string | null;
  contactId: string | null;
  ownerId: string | null;
  pipelineId: string;
  stageId: string;
  company: CompanyRef | null;
  contact: ContactRef | null;
  owner: PersonRef | null;
  pipeline: { id: string; name: string };
  stage: Stage;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
  activities?: LeadActivity[];
  followUps?: FollowUp[];
  project?: { id: string; name: string; status: string; archivedAt: string | null } | null;
}

export const companyStatuses = [
  { label: 'Prospect', value: 'PROSPECT' },
  { label: 'Active client', value: 'ACTIVE_CLIENT' },
  { label: 'Inactive', value: 'INACTIVE' },
  { label: 'Archived', value: 'ARCHIVED' },
] as const;
export const leadSources = [
  'REFERRAL',
  'WEBSITE',
  'FACEBOOK',
  'LINKEDIN',
  'EMAIL',
  'PHONE',
  'EXISTING_CLIENT',
  'PARTNER',
  'OTHER',
] as const;
export const leadPriorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export const labelize = (value: string) =>
  value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
export const personName = (person: PersonRef | null | undefined) =>
  person ? `${person.firstName} ${person.lastName}` : 'Unassigned';
export const formatMoney = (value: string | null, currency: string) =>
  value
    ? new Intl.NumberFormat('en-BD', {
        style: 'currency',
        currency,
        maximumFractionDigits: 2,
      }).format(Number(value))
    : '-';
