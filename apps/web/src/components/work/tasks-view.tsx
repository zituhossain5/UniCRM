'use client';

import { useCurrentUser } from '@/components/auth-provider';
import { SavedViewsBar } from '@/components/configuration/list-configuration';
import { apiRequest } from '@/lib/api';
import { onCrmDataChanged } from '@/lib/crm-events';
import { labelize, personName } from '@/lib/crm-types';
import { formatDateOnly, type ListResponse, type TaskRecord } from '@/lib/work-types';
import { useWorkReferenceData } from '@/lib/work-reference-data';
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
} from '@unicrm/ui';
import { ListChecks, Plus, Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { TaskCreateSheet } from './create-sheets';
import { TaskQuickView } from './task-quick-view';

const views = [
  ['all', 'All'],
  ['mine', 'My Tasks'],
  ['dueToday', 'Due Today'],
  ['overdue', 'Overdue'],
] as const;

export function TasksView() {
  const current = useCurrentUser();
  const references = useWorkReferenceData();
  const [result, setResult] = useState<ListResponse<TaskRecord>>();
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [view, setView] = useState('all');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [project, setProject] = useState('');
  const [assignee, setAssignee] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [sorting, setSorting] = useState('createdAt:desc');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const taskId = new URLSearchParams(window.location.search).get('task');
    if (taskId) setSelected(taskId);
  }, []);
  const load = useCallback(async () => {
    try {
      setError('');
      const params = new URLSearchParams({ page: String(page), limit: '25', view });
      if (query.trim()) params.set('search', query.trim());
      if (status) params.set('status', status);
      if (priority) params.set('priority', priority);
      if (project) params.set('project', project);
      if (assignee) params.set('assignee', assignee);
      if (dueDate) params.set('dueDate', dueDate);
      const [sort, order] = sorting.split(':');
      params.set('sort', sort!);
      params.set('order', order!);
      setResult(await apiRequest<ListResponse<TaskRecord>>(`/tasks?${params}`));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load tasks.');
    }
  }, [assignee, dueDate, page, priority, project, query, sorting, status, view]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => onCrmDataChanged(['tasks'], () => void load()), [load]);
  const applySavedView = useCallback(
    (
      filters: Record<string, unknown>,
      savedSort: { field: string; order: 'asc' | 'desc' } | null,
    ) => {
      setQuery(typeof filters.search === 'string' ? filters.search : '');
      setView(typeof filters.view === 'string' ? filters.view : 'all');
      setStatus(typeof filters.status === 'string' ? filters.status : '');
      setPriority(typeof filters.priority === 'string' ? filters.priority : '');
      setProject(typeof filters.project === 'string' ? filters.project : '');
      setAssignee(typeof filters.assignee === 'string' ? filters.assignee : '');
      setDueDate(typeof filters.dueDate === 'string' ? filters.dueDate : '');
      if (savedSort) setSorting(`${savedSort.field}:${savedSort.order}`);
      setPage(1);
    },
    [],
  );
  const [sortField, sortOrder] = sorting.split(':') as [string, 'asc' | 'desc'];

  return (
    <div className="crm-page">
      <PageHeader
        description="Delivery work across projects, people, and deadlines."
        title="Tasks"
        actions={
          current.permissions.includes('task.create') ? (
            <TaskCreateSheet
              onCreated={load}
              onOpenChange={setCreateOpen}
              open={createOpen}
              trigger={
                <Button>
                  <Plus size={15} /> New task
                </Button>
              }
            />
          ) : undefined
        }
      />
      <SavedViewsBar
        entityType="TASK"
        filters={{ search: query, view, status, priority, project, assignee, dueDate }}
        sort={{ field: sortField, order: sortOrder }}
        onApply={applySavedView}
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
      <div className="crm-toolbar">
        <label className="crm-search">
          <Search size={16} />
          <Input
            aria-label="Search tasks"
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Search tasks..."
            value={query}
          />
        </label>
        <Select
          label="Status"
          onValueChange={(value) => {
            setStatus(value ?? '');
            setPage(1);
          }}
          options={[
            { label: 'All statuses', value: '' },
            ...['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED', 'BLOCKED'].map((value) => ({
              label: labelize(value),
              value,
            })),
          ]}
          value={status}
        />
        <Select
          label="Priority"
          onValueChange={(value) => {
            setPriority(value ?? '');
            setPage(1);
          }}
          options={[
            { label: 'All priorities', value: '' },
            ...['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((value) => ({
              label: labelize(value),
              value,
            })),
          ]}
          value={priority}
        />
        <Select
          label="Project"
          onValueChange={(value) => {
            setProject(value ?? '');
            setPage(1);
          }}
          options={[
            { label: 'All projects', value: '' },
            ...references.projects.map((item) => ({ label: item.name, value: item.id })),
          ]}
          value={project}
        />
        <Select
          label="Assignee"
          onValueChange={(value) => {
            setAssignee(value ?? '');
            setPage(1);
          }}
          options={[
            { label: 'All assignees', value: '' },
            ...references.users.map((user) => ({ label: personName(user), value: user.id })),
          ]}
          value={assignee}
        />
        <Input
          aria-label="Filter by due date"
          onChange={(event) => {
            setDueDate(event.target.value);
            setPage(1);
          }}
          title="Due date"
          type="date"
          value={dueDate}
        />
        <Select
          label="Sort"
          onValueChange={(value) => {
            setSorting(value ?? 'createdAt:desc');
            setPage(1);
          }}
          options={[
            { label: 'Newest first', value: 'createdAt:desc' },
            { label: 'Task A-Z', value: 'title:asc' },
            { label: 'Due date soonest', value: 'dueDate:asc' },
            { label: 'Recently updated', value: 'updatedAt:desc' },
          ]}
          value={sorting}
        />
      </div>
      {!result && !error ? <LoadingState label="Loading tasks" /> : null}
      {error ? (
        <ErrorState
          description={error}
          action={
            <Button variant="outline" onClick={() => void load()}>
              Try again
            </Button>
          }
        />
      ) : null}
      {result && !result.data.length ? (
        <EmptyState
          action={
            current.permissions.includes('task.create') ? (
              <Button onClick={() => setCreateOpen(true)}>Create task</Button>
            ) : undefined
          }
          description="Create tasks inside active client projects."
          icon={<ListChecks size={20} />}
          title="No tasks found"
        />
      ) : null}
      {result?.data.length ? (
        <>
          <div className="crm-table-wrap">
            <table className="crm-table tasks-table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Project</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Assignee</th>
                  <th>Due date</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((task) => (
                  <tr key={task.id}>
                    <td>
                      <button
                        className="crm-record-button"
                        onClick={() => setSelected(task.id)}
                        type="button"
                      >
                        <strong>{task.title}</strong>
                        <span>{task._count.comments} comments</span>
                      </button>
                    </td>
                    <td>{task.project.name}</td>
                    <td>
                      <Badge
                        tone={
                          task.status === 'COMPLETED'
                            ? 'success'
                            : task.status === 'BLOCKED'
                              ? 'danger'
                              : 'neutral'
                        }
                      >
                        {labelize(task.status)}
                      </Badge>
                    </td>
                    <td>{labelize(task.priority)}</td>
                    <td>{personName(task.assignee)}</td>
                    <td
                      className={
                        task.dueDate &&
                        task.status !== 'COMPLETED' &&
                        task.dueDate.slice(0, 10) < new Date().toISOString().slice(0, 10)
                          ? 'overdue-text'
                          : ''
                      }
                    >
                      {formatDateOnly(task.dueDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            currentPage={result.meta.page}
            onPageChange={setPage}
            totalPages={result.meta.totalPages}
          />
        </>
      ) : null}
      <TaskQuickView
        onChanged={load}
        onOpenChange={(open) => !open && setSelected(null)}
        open={Boolean(selected)}
        taskId={selected}
      />
    </div>
  );
}
