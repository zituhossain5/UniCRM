'use client';

import { ErrorState, LoadingState, PageHeader } from '@unicrm/ui';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  CalendarClock,
  CircleDollarSign,
  ListChecks,
  UsersRound,
} from 'lucide-react';
import Link from 'next/link';
import { apiRequest } from '@/lib/api';
import type {
  ActivityEvent,
  DashboardFollowUp,
  DashboardSummary,
  DashboardTask,
} from '@/lib/operational-types';

const money = (amount: string, currency: string) =>
  new Intl.NumberFormat('en-BD', { style: 'currency', currency }).format(Number(amount));
const when = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: value.includes('T') ? 'short' : undefined,
  }).format(new Date(value));

export function DashboardView() {
  const summary = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: () => apiRequest<{ data: DashboardSummary }>('/dashboard/summary'),
    staleTime: 60_000,
  });
  const tasks = useQuery({
    queryKey: ['dashboard', 'tasks'],
    queryFn: () => apiRequest<{ data: DashboardTask[] }>('/dashboard/my-tasks'),
  });
  const followUps = useQuery({
    queryKey: ['dashboard', 'follow-ups'],
    queryFn: () => apiRequest<{ data: DashboardFollowUp[] }>('/dashboard/follow-ups'),
  });
  const activity = useQuery({
    queryKey: ['dashboard', 'activity'],
    queryFn: () => apiRequest<{ data: ActivityEvent[] }>('/dashboard/recent-activity'),
  });
  if (summary.isLoading) return <LoadingState label="Loading dashboard" />;
  if (summary.isError)
    return (
      <ErrorState
        action={
          <button className="ui-button ui-button--outline" onClick={() => void summary.refetch()}>
            Try again
          </button>
        }
        description={summary.error.message}
      />
    );
  const data = summary.data!.data;
  const outstanding =
    data.outstandingBalances?.map((entry) => money(entry.amount, entry.currency)).join(' · ') ??
    null;
  const metrics = [
    { label: 'Open leads', value: data.openLeads, href: '/app/leads?view=open', icon: UsersRound },
    {
      label: 'Active projects',
      value: data.activeProjects,
      href: '/app/projects?view=active',
      icon: BriefcaseBusiness,
    },
    {
      label: 'Outstanding',
      value: outstanding,
      href: '/app/reports#outstanding-balances',
      icon: CircleDollarSign,
    },
    {
      label: 'Due today',
      value: data.tasksDueToday,
      href: '/app/tasks?view=dueToday',
      icon: CalendarClock,
    },
    {
      label: 'Overdue tasks',
      value: data.overdueTasks,
      href: '/app/tasks?view=overdue',
      icon: AlertTriangle,
    },
    {
      label: 'Follow-ups',
      value: data.upcomingFollowUps,
      href: '/app/leads?view=followUpDue',
      icon: ListChecks,
    },
  ].filter((metric) => metric.value !== null);
  return (
    <section className="operational-page">
      <PageHeader title="Dashboard" description="What needs your attention today?" />
      <div className="metric-grid">
        {metrics.map((metric) => (
          <Link className="metric-card" href={metric.href} key={metric.label}>
            <span>
              <metric.icon size={15} />
              {metric.label}
            </span>
            <strong>{metric.value}</strong>
            <ArrowRight size={14} />
          </Link>
        ))}
      </div>
      <div className="dashboard-grid">
        <DashboardSection title="My tasks" loading={tasks.isLoading} error={tasks.isError}>
          {tasks.data?.data.length ? (
            tasks.data.data.map((task) => (
              <Link
                className="attention-row"
                href={
                  task.project
                    ? `/app/projects/${task.project.id}?task=${task.id}`
                    : `/app/tasks?task=${task.id}`
                }
                key={task.id}
              >
                <span>
                  <strong>{task.title}</strong>
                  <small>{task.project?.name ?? 'No project'}</small>
                </span>
                <time className={new Date(task.dueDate) < new Date() ? 'overdue-text' : ''}>
                  {when(task.dueDate)}
                </time>
              </Link>
            ))
          ) : (
            <p className="record-empty">No assigned tasks need attention.</p>
          )}
        </DashboardSection>
        <DashboardSection
          title="Upcoming follow-ups"
          loading={followUps.isLoading}
          error={followUps.isError}
        >
          {followUps.data?.data.length ? (
            followUps.data.data.map((item) => (
              <Link className="attention-row" href={`/app/leads/${item.lead.id}`} key={item.id}>
                <span>
                  <strong>{item.lead.title}</strong>
                  <small>{item.lead.company?.name ?? item.type}</small>
                </span>
                <time className={new Date(item.dueAt) < new Date() ? 'overdue-text' : ''}>
                  {when(item.dueAt)}
                </time>
              </Link>
            ))
          ) : (
            <p className="record-empty">No pending follow-ups.</p>
          )}
        </DashboardSection>
        <DashboardSection
          title="Recent activity"
          loading={activity.isLoading}
          error={activity.isError}
          wide
        >
          {activity.data?.data.length ? (
            activity.data.data.map((event) => (
              <div className="activity-feed-row" key={event.id}>
                <span className="activity-dot" />
                <span>
                  <strong>{event.action.replaceAll('_', ' ').toLowerCase()}</strong>
                  <small>
                    {event.actor ? `${event.actor.firstName} ${event.actor.lastName}` : 'System'}
                  </small>
                </span>
                <time>{when(event.createdAt)}</time>
              </div>
            ))
          ) : (
            <p className="record-empty">No recent business activity.</p>
          )}
        </DashboardSection>
      </div>
    </section>
  );
}

function DashboardSection({
  children,
  error,
  loading,
  title,
  wide = false,
}: {
  children: React.ReactNode;
  error: boolean;
  loading: boolean;
  title: string;
  wide?: boolean;
}) {
  return (
    <section className={`dashboard-section${wide ? ' dashboard-section--wide' : ''}`}>
      <header>
        <h2>{title}</h2>
      </header>
      {loading ? (
        <LoadingState label={`Loading ${title}`} />
      ) : error ? (
        <p className="record-empty overdue-text">Could not load this section.</p>
      ) : (
        children
      )}
    </section>
  );
}
