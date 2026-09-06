'use client';

import { useCurrentUser } from '@/components/auth-provider';
import { MetadataListControls, SavedViewsBar } from '@/components/configuration/list-configuration';
import { apiRequest } from '@/lib/api';
import { onCrmDataChanged } from '@/lib/crm-events';
import { labelize, personName } from '@/lib/crm-types';
import { formatDateOnly, type ListResponse, type ProjectRecord } from '@/lib/work-types';
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
import { ClipboardList, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ProjectCreateSheet } from './create-sheets';

const views = [
  ['all', 'All'],
  ['active', 'Active'],
  ['planned', 'Planned'],
  ['onHold', 'On Hold'],
  ['completed', 'Completed'],
] as const;

export function ProjectsView() {
  const current = useCurrentUser();
  const references = useWorkReferenceData();
  const [result, setResult] = useState<ListResponse<ProjectRecord>>();
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [view, setView] = useState('all');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [manager, setManager] = useState('');
  const [company, setCompany] = useState('');
  const [deadline, setDeadline] = useState('');
  const [sorting, setSorting] = useState('createdAt:desc');
  const [tag, setTag] = useState('');
  const [customFields, setCustomFields] = useState<Record<string, unknown>>({});
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const load = useCallback(async () => {
    try {
      setError('');
      const params = new URLSearchParams({ page: String(page), limit: '25', view });
      if (query.trim()) params.set('search', query.trim());
      if (status) params.set('status', status);
      if (priority) params.set('priority', priority);
      if (manager) params.set('manager', manager);
      if (company) params.set('company', company);
      if (deadline) params.set('deadline', deadline);
      if (tag) params.set('tag', tag);
      if (
        Object.keys(customFields).length &&
        Object.values(customFields).every((value) => value !== '')
      )
        params.set('customFields', JSON.stringify(customFields));
      const [sort, order] = sorting.split(':');
      params.set('sort', sort!);
      params.set('order', order!);
      setResult(await apiRequest<ListResponse<ProjectRecord>>(`/projects?${params}`));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load projects.');
    }
  }, [company, customFields, deadline, manager, page, priority, query, sorting, status, tag, view]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => onCrmDataChanged(['projects'], () => void load()), [load]);
  const applySavedView = useCallback(
    (
      filters: Record<string, unknown>,
      savedSort: { field: string; order: 'asc' | 'desc' } | null,
    ) => {
      setQuery(typeof filters.search === 'string' ? filters.search : '');
      setView(typeof filters.view === 'string' ? filters.view : 'all');
      setStatus(typeof filters.status === 'string' ? filters.status : '');
      setPriority(typeof filters.priority === 'string' ? filters.priority : '');
      setManager(typeof filters.manager === 'string' ? filters.manager : '');
      setCompany(typeof filters.company === 'string' ? filters.company : '');
      setDeadline(typeof filters.deadline === 'string' ? filters.deadline : '');
      setTag(typeof filters.tag === 'string' ? filters.tag : '');
      setCustomFields(
        filters.customFields &&
          typeof filters.customFields === 'object' &&
          !Array.isArray(filters.customFields)
          ? (filters.customFields as Record<string, unknown>)
          : {},
      );
      if (savedSort) setSorting(`${savedSort.field}:${savedSort.order}`);
      setPage(1);
    },
    [],
  );
  const [sortField, sortOrder] = sorting.split(':') as [string, 'asc' | 'desc'];

  return (
    <div className="crm-page">
      <PageHeader
        description="Client delivery work, ownership, deadlines, and progress."
        title="Projects"
        actions={
          current.permissions.includes('project.create') ? (
            <ProjectCreateSheet
              onCreated={load}
              onOpenChange={setCreateOpen}
              open={createOpen}
              trigger={
                <Button>
                  <Plus size={15} /> New project
                </Button>
              }
            />
          ) : undefined
        }
      />
      <SavedViewsBar
        entityType="PROJECT"
        filters={{
          search: query,
          view,
          status,
          priority,
          manager,
          company,
          deadline,
          tag,
          customFields,
        }}
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
            aria-label="Search projects"
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Search projects..."
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
            ...['PLANNED', 'IN_PROGRESS', 'ON_HOLD', 'IN_REVIEW', 'COMPLETED', 'CANCELLED'].map(
              (value) => ({ label: labelize(value), value }),
            ),
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
          label="Manager"
          onValueChange={(value) => {
            setManager(value ?? '');
            setPage(1);
          }}
          options={[
            { label: 'All managers', value: '' },
            ...references.users.map((user) => ({ label: personName(user), value: user.id })),
          ]}
          value={manager}
        />
        <Select
          label="Client"
          onValueChange={(value) => {
            setCompany(value ?? '');
            setPage(1);
          }}
          options={[
            { label: 'All clients', value: '' },
            ...references.companies.map((item) => ({ label: item.name, value: item.id })),
          ]}
          value={company}
        />
        <Input
          aria-label="Filter by deadline"
          onChange={(event) => {
            setDeadline(event.target.value);
            setPage(1);
          }}
          title="Deadline"
          type="date"
          value={deadline}
        />
        <Select
          label="Sort"
          onValueChange={(value) => {
            setSorting(value ?? 'createdAt:desc');
            setPage(1);
          }}
          options={[
            { label: 'Newest first', value: 'createdAt:desc' },
            { label: 'Name A-Z', value: 'name:asc' },
            { label: 'Deadline soonest', value: 'deadline:asc' },
            { label: 'Progress highest', value: 'progress:desc' },
          ]}
          value={sorting}
        />
        <MetadataListControls
          entityType="PROJECT"
          tag={tag}
          onTagChange={(value) => {
            setTag(value);
            setPage(1);
          }}
          customFields={customFields}
          onCustomFieldsChange={(value) => {
            setCustomFields(value);
            setPage(1);
          }}
        />
      </div>
      {!result && !error ? <LoadingState label="Loading projects" /> : null}
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
            current.permissions.includes('project.create') ? (
              <Button onClick={() => setCreateOpen(true)}>Create project</Button>
            ) : undefined
          }
          description="Create a project when a client engagement is ready to begin."
          icon={<ClipboardList size={20} />}
          title="No projects yet"
        />
      ) : null}
      {result?.data.length ? (
        <>
          <div className="crm-table-wrap">
            <table className="crm-table projects-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Client</th>
                  <th>Status</th>
                  <th>Progress</th>
                  <th>Manager</th>
                  <th>Deadline</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((project) => (
                  <tr key={project.id}>
                    <td>
                      <Link className="crm-record-link" href={`/app/projects/${project.id}`}>
                        <strong>{project.name}</strong>
                        <span>{labelize(project.priority)} priority</span>
                        {project.tags?.length ? (
                          <span className="record-tags">
                            {project.tags.map((item) => (
                              <Badge key={item.id} tone="neutral">
                                {item.name}
                              </Badge>
                            ))}
                          </span>
                        ) : null}
                      </Link>
                    </td>
                    <td>{project.company.name}</td>
                    <td>
                      <Badge
                        tone={
                          project.status === 'COMPLETED'
                            ? 'success'
                            : project.status === 'ON_HOLD'
                              ? 'warning'
                              : 'neutral'
                        }
                      >
                        {labelize(project.status)}
                      </Badge>
                    </td>
                    <td>
                      <div className="project-progress">
                        <span style={{ width: `${project.progress}%` }} />
                        <small>{project.progress}%</small>
                      </div>
                    </td>
                    <td>{personName(project.projectManager)}</td>
                    <td>{formatDateOnly(project.deadline)}</td>
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
    </div>
  );
}
