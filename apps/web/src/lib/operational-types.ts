export interface DashboardSummary {
  openLeads: number | null;
  activeProjects: number | null;
  tasksDueToday: number | null;
  overdueTasks: number | null;
  upcomingFollowUps: number | null;
  outstandingBalances: Array<{ currency: string; amount: string }> | null;
}
export interface DashboardTask {
  id: string;
  title: string;
  dueDate: string;
  priority: string;
  status: string;
  project: { id: string; name: string } | null;
}
export interface DashboardFollowUp {
  id: string;
  dueAt: string;
  type: string;
  lead: { id: string; title: string; company: { id: string; name: string } | null };
  assignedTo: { id: string; firstName: string; lastName: string } | null;
}
export interface ActivityEvent {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  metadata: unknown;
  createdAt: string;
  actor: { firstName: string; lastName: string } | null;
}
export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}
export interface SearchResults {
  companies: Array<{ id: string; name: string; email: string | null }>;
  contacts: Array<{
    id: string;
    firstName: string;
    lastName: string;
    company: { name: string } | null;
  }>;
  leads: Array<{
    id: string;
    title: string;
    company: { name: string } | null;
    stage: { name: string };
  }>;
  projects: Array<{ id: string; name: string; company: { name: string }; status: string }>;
  tasks: Array<{
    id: string;
    title: string;
    project: { id: string; name: string } | null;
    status: string;
  }>;
  quotations: Array<{
    id: string;
    quotationNumber: string;
    company: { name: string };
    status: string;
  }>;
}
