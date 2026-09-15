'use client';

import { useCurrentUser } from '@/components/auth-provider';
import { apiRequest } from '@/lib/api';
import type { ActivityListResponse, ActivityRecord } from '@/lib/activity-types';
import { labelize, personName } from '@/lib/crm-types';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  PageHeader,
  Pagination,
  Select,
  Sheet,
} from '@unicrm/ui';
import { CalendarDays, Check, Clock3, Phone, Plus, Search, Video, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { ActivitySheet } from './activity-sheet';
import { ActivityTable } from './activity-table';

const views = [
  ['today', 'Today'],
  ['upcoming', 'Upcoming'],
  ['overdue', 'Overdue'],
  ['completed', 'Completed'],
  ['mine', 'My Activities'],
] as const;

export function ActivitiesView() {
  const current = useCurrentUser();
  const [result, setResult] = useState<ActivityListResponse>();
  const [view, setView] = useState('today');
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [owner, setOwner] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [users, setUsers] = useState<Array<{ id: string; firstName: string; lastName: string }>>(
    [],
  );
  const [selected, setSelected] = useState<ActivityRecord>();
  const [createType, setCreateType] = useState<'CALL' | 'MEETING' | 'FOLLOW_UP' | 'OTHER'>();
  const [editOpen, setEditOpen] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('view')) setView(params.get('view')!);
    if (params.get('type')) setType(params.get('type')!);
  }, []);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ view, page: String(page), limit: '25' });
    if (query.trim()) params.set('search', query.trim());
    if (type) params.set('type', type);
    if (status) params.set('status', status);
    if (owner) params.set('owner', owner);
    if (dateFrom) params.set('dateFrom', new Date(`${dateFrom}T00:00:00`).toISOString());
    if (dateTo) params.set('dateTo', new Date(`${dateTo}T23:59:59`).toISOString());
    try {
      setError('');
      setResult(await apiRequest<ActivityListResponse>(`/activities?${params}`));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load activities.');
    }
  }, [dateFrom, dateTo, owner, page, query, status, type, view]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 200);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    void apiRequest<{ data: typeof users }>('/users').then((response) => setUsers(response.data));
  }, []);

  async function statusChange(activity: ActivityRecord, action: 'complete' | 'cancel') {
    await apiRequest(`/activities/${activity.id}/${action}`, { method: 'POST' });
    setSelected(undefined);
    await load();
  }

  const timezone = result?.meta.timezone ?? 'UTC';
  return (
    <div className="crm-page activity-center">
      <PageHeader
        title="Activities"
        description="Calls, meetings, follow-ups, and tasks in one daily workspace"
        actions={
          <div className="activity-header-actions">
            <Button variant="secondary" onClick={() => window.location.assign('/app/calendar')}>
              <CalendarDays size={15} />
              Calendar
            </Button>
            {current.permissions.includes('activity.create') ? (
              <>
                <Button variant="secondary" onClick={() => setCreateType('CALL')}>
                  <Phone size={15} />
                  Call
                </Button>
                <Button variant="secondary" onClick={() => setCreateType('MEETING')}>
                  <Video size={15} />
                  Meeting
                </Button>
                <Button variant="secondary" onClick={() => setCreateType('FOLLOW_UP')}>
                  <Plus size={15} />
                  Follow-up
                </Button>
              </>
            ) : null}
          </div>
        }
      />
      <div className="crm-view-tabs" role="tablist">
        {views.map(([value, label]) => (
          <button
            aria-selected={view === value}
            key={value}
            onClick={() => {
              setView(value);
              setPage(1);
            }}
            role="tab"
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      <div className="crm-toolbar activity-toolbar">
        <label className="crm-search">
          <Search size={16} />
          <Input
            aria-label="Search activities"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search activities…"
            value={query}
          />
        </label>
        <div className="activity-filter">
          <Select
            label="Type"
            onValueChange={(value) => setType(value ?? '')}
            options={[
              { label: 'All types', value: '' },
              ...['CALL', 'MEETING', 'FOLLOW_UP', 'TASK', 'PROJECT_DEADLINE', 'OTHER'].map(
                (value) => ({ label: labelize(value), value }),
              ),
            ]}
            value={type}
          />
        </div>
        <div className="activity-filter">
          <Select
            label="Owner"
            onValueChange={(value) => setOwner(value ?? '')}
            options={[
              { label: 'All owners', value: '' },
              ...users.map((user) => ({ label: personName(user), value: user.id })),
            ]}
            value={owner}
          />
        </div>
        <div className="activity-filter">
          <Select
            label="Status"
            onValueChange={(value) => setStatus(value ?? '')}
            options={[
              { label: 'All statuses', value: '' },
              ...['PLANNED', 'COMPLETED', 'CANCELLED'].map((value) => ({
                label: labelize(value),
                value,
              })),
            ]}
            value={status}
          />
        </div>
        <label className="activity-filter">
          <span className="visually-hidden">From date</span>
          <Input
            aria-label="From date"
            onChange={(event) => setDateFrom(event.target.value)}
            type="date"
            value={dateFrom}
          />
        </label>
        <label className="activity-filter">
          <span className="visually-hidden">To date</span>
          <Input
            aria-label="To date"
            onChange={(event) => setDateTo(event.target.value)}
            type="date"
            value={dateTo}
          />
        </label>
      </div>
      <p className="activity-timezone">
        <Clock3 size={14} />
        Times shown in {timezone}
      </p>
      {error ? (
        <ErrorState
          description={error}
          action={
            <Button variant="outline" onClick={() => void load()}>
              Try again
            </Button>
          }
        />
      ) : !result ? (
        <LoadingState label="Loading activities" />
      ) : result.data.length ? (
        <ActivityTable
          activities={result.data}
          onActivate={(item) =>
            item.source === 'SCHEDULED_ACTIVITY'
              ? setSelected(item)
              : window.location.assign(
                  item.source === 'TASK'
                    ? `/app/tasks?task=${item.id}`
                    : item.source === 'PROJECT_DEADLINE'
                      ? `/app/projects/${item.id}`
                      : `/app/leads/${item.relatedEntityId}`,
                )
          }
          permissions={current.permissions}
          timeZone={timezone}
          view={view}
        />
      ) : (
        <EmptyState
          icon={<CalendarDays size={22} />}
          title="No activities here"
          description="Schedule a call, meeting, or follow-up to start planning CRM work."
        />
      )}
      {result ? (
        <Pagination
          currentPage={result.meta.page}
          totalPages={result.meta.totalPages}
          onPageChange={setPage}
        />
      ) : null}
      {createType ? (
        <ActivitySheet
          defaultType={createType}
          onOpenChange={(open) => {
            if (!open) setCreateType(undefined);
          }}
          onSaved={() => void load()}
          open
          trigger={
            <button className="visually-hidden" type="button">
              Schedule
            </button>
          }
        />
      ) : null}
      {selected ? (
        <Sheet
          title={selected.subject}
          description={`${labelize(selected.type)} · ${new Intl.DateTimeFormat(undefined, { timeZone: timezone, dateStyle: 'full', timeStyle: 'short' }).format(new Date(selected.startAt))}`}
          onOpenChange={(open) => {
            if (!open) setSelected(undefined);
          }}
          open
          trigger={
            <button className="visually-hidden" type="button">
              Activity detail
            </button>
          }
        >
          <div className="activity-detail">
            <dl>
              <div>
                <dt>Status</dt>
                <dd>
                  <Badge>{labelize(selected.status)}</Badge>
                </dd>
              </div>
              <div>
                <dt>Owner</dt>
                <dd>{selected.owner ? personName(selected.owner) : 'Unassigned'}</dd>
              </div>
              <div>
                <dt>Related record</dt>
                <dd>
                  {selected.relatedRecord?.name ?? labelize(selected.relatedEntityType ?? '')}
                </dd>
              </div>
              <div>
                <dt>Reminder</dt>
                <dd>
                  {selected.reminderAt
                    ? new Intl.DateTimeFormat(undefined, {
                        timeZone: timezone,
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(new Date(selected.reminderAt))
                    : 'None'}
                </dd>
              </div>
            </dl>
            {selected.description ? <p>{selected.description}</p> : null}
            {selected.status === 'PLANNED' ? (
              <div className="activity-detail-actions">
                {current.permissions.includes('activity.update') ? (
                  <>
                    <Button onClick={() => void statusChange(selected, 'complete')}>
                      <Check size={15} />
                      Complete
                    </Button>
                    <Button variant="secondary" onClick={() => setEditOpen(true)}>
                      <Clock3 size={15} />
                      Reschedule
                    </Button>
                  </>
                ) : null}
                {current.permissions.includes('activity.delete') ? (
                  <Button variant="secondary" onClick={() => void statusChange(selected, 'cancel')}>
                    <X size={15} />
                    Cancel
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </Sheet>
      ) : null}
      {selected && editOpen ? (
        <ActivitySheet
          activity={selected}
          onOpenChange={setEditOpen}
          onSaved={() => {
            setSelected(undefined);
            void load();
          }}
          open
          related={{
            type: selected.relatedEntityType as never,
            id: selected.relatedEntityId!,
            name: selected.relatedRecord?.name ?? labelize(selected.relatedEntityType ?? ''),
          }}
          trigger={
            <button className="visually-hidden" type="button">
              Reschedule
            </button>
          }
        />
      ) : null}
    </div>
  );
}
