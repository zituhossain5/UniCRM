'use client';

import { useCurrentUser } from '@/components/auth-provider';
import { apiRequest } from '@/lib/api';
import {
  caseLabel,
  casePriorities,
  caseStatuses,
  caseTypes,
  type CustomerCase,
} from '@/lib/case-types';
import { useCrmReferenceData, userOptions } from '@/lib/crm-reference-data';
import type { PaginationMeta } from '@/lib/crm-types';
import {
  Avatar,
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
import { useQuery } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { CaseCreateSheet } from './case-create-sheet';

const views = ['all', 'mine', 'unassigned', 'open', 'waiting', 'overdue', 'resolved'] as const;

export function CasesView({ initialView = 'all' }: { initialView?: string }) {
  const current = useCurrentUser();
  const { users } = useCrmReferenceData({ users: current.permissions.includes('user.read') });
  const [view, setView] = useState(initialView);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [type, setType] = useState('');
  const [assignee, setAssignee] = useState('');
  const [company, setCompany] = useState('');
  const [contact, setContact] = useState('');
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [references, setReferences] = useState<{
    companies: Array<{ id: string; name: string }>;
    contacts: Array<{ id: string; firstName: string; lastName: string }>;
  }>({ companies: [], contacts: [] });
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ view, page: String(page), limit: '25' });
    if (search.trim()) params.set('search', search.trim());
    if (status) params.set('status', status);
    if (priority) params.set('priority', priority);
    if (type) params.set('type', type);
    if (assignee) params.set('assignee', assignee);
    if (company) params.set('company', company);
    if (contact) params.set('contact', contact);
    if (dueFrom) params.set('dueFrom', new Date(`${dueFrom}T00:00:00`).toISOString());
    if (dueTo) params.set('dueTo', new Date(`${dueTo}T23:59:59.999`).toISOString());
    return params.toString();
  }, [assignee, company, contact, dueFrom, dueTo, page, priority, search, status, type, view]);
  const list = useQuery({
    queryKey: ['cases', 'list', queryString],
    queryFn: () =>
      apiRequest<{ data: CustomerCase[]; meta: PaginationMeta }>(`/cases?${queryString}`),
  });
  const records = list.data?.data;
  const meta = list.data?.meta ?? { page: 1, limit: 25, total: 0, totalPages: 1 };

  useEffect(() => {
    void Promise.all([
      apiRequest<{ data: Array<{ id: string; name: string }> }>('/companies?limit=100'),
      apiRequest<{ data: Array<{ id: string; firstName: string; lastName: string }> }>(
        '/contacts?limit=100',
      ),
    ])
      .then(([companies, contacts]) =>
        setReferences({ companies: companies.data, contacts: contacts.data }),
      )
      .catch(() => undefined);
  }, []);
  const filter = (setter: (value: string) => void) => (value: string | null) => {
    setter(value ?? '');
    setPage(1);
  };

  return (
    <div className="crm-page cases-page">
      <PageHeader
        title="Cases"
        description={`${meta.total} customer cases in this view`}
        actions={
          current.permissions.includes('case.create') ? (
            <CaseCreateSheet
              open={createOpen}
              onOpenChange={setCreateOpen}
              trigger={
                <Button>
                  <Plus size={15} />
                  New case
                </Button>
              }
            />
          ) : undefined
        }
      />
      <div className="crm-view-tabs" role="tablist" aria-label="Case views">
        {views.map((item) => (
          <button
            aria-selected={view === item}
            key={item}
            onClick={() => {
              setView(item);
              setPage(1);
            }}
            role="tab"
            type="button"
          >
            {caseLabel(item)}
          </button>
        ))}
      </div>
      <div className="crm-toolbar cases-toolbar">
        <label className="crm-search">
          <Search size={15} />
          <Input
            aria-label="Search cases"
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search cases..."
            value={search}
          />
        </label>
        <Select
          aria-label="Status"
          value={status}
          onValueChange={filter(setStatus)}
          options={[
            { value: '', label: 'All statuses' },
            ...caseStatuses.map((value) => ({ value, label: caseLabel(value) })),
          ]}
        />
        <Select
          aria-label="Priority"
          value={priority}
          onValueChange={filter(setPriority)}
          options={[
            { value: '', label: 'All priorities' },
            ...casePriorities.map((value) => ({ value, label: caseLabel(value) })),
          ]}
        />
        <Select
          aria-label="Type"
          value={type}
          onValueChange={filter(setType)}
          options={[
            { value: '', label: 'All types' },
            ...caseTypes.map((value) => ({ value, label: caseLabel(value) })),
          ]}
        />
        {users.length ? (
          <Select
            aria-label="Assignee"
            value={assignee}
            onValueChange={filter(setAssignee)}
            options={[{ value: '', label: 'All assignees' }, ...userOptions(users)]}
          />
        ) : null}
        <Select
          aria-label="Company"
          value={company}
          onValueChange={filter(setCompany)}
          options={[
            { value: '', label: 'All companies' },
            ...references.companies.map((item) => ({ value: item.id, label: item.name })),
          ]}
        />
        <Select
          aria-label="Contact"
          value={contact}
          onValueChange={filter(setContact)}
          options={[
            { value: '', label: 'All contacts' },
            ...references.contacts.map((item) => ({
              value: item.id,
              label: `${item.firstName} ${item.lastName}`,
            })),
          ]}
        />
        <Input
          aria-label="Due from"
          onChange={(event) => {
            setDueFrom(event.target.value);
            setPage(1);
          }}
          type="date"
          value={dueFrom}
        />
        <Input
          aria-label="Due to"
          onChange={(event) => {
            setDueTo(event.target.value);
            setPage(1);
          }}
          type="date"
          value={dueTo}
        />
      </div>
      {list.isError ? (
        <ErrorState
          title="Cases unavailable"
          description={list.error.message}
          action={<Button onClick={() => void list.refetch()}>Retry</Button>}
        />
      ) : !records ? (
        <LoadingState label="Loading cases" />
      ) : !records.length ? (
        <EmptyState
          title="No cases found"
          description="Create a case or adjust the current filters."
        />
      ) : (
        <>
          <div className="cases-table-shell">
            <table className="cases-table">
              <colgroup>
                <col className="cases-column-case" />
                <col className="cases-column-customer" />
                <col className="cases-column-status" />
                <col className="cases-column-priority" />
                <col className="cases-column-assignee" />
                <col className="cases-column-due" />
                <col className="cases-column-updated" />
              </colgroup>
              <thead>
                <tr>
                  <th>Case</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Assignee</th>
                  <th>Due</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id}>
                    <td className="cases-primary-cell">
                      <Link className="record-link" href={`/app/cases/${record.id}`}>
                        <strong>{record.caseNumber}</strong>
                        <span title={record.title}>{record.title}</span>
                      </Link>
                    </td>
                    <td className="cases-customer-cell">
                      {record.contact ? (
                        <strong>{`${record.contact.firstName} ${record.contact.lastName}`}</strong>
                      ) : null}
                      {record.company ? <span>{record.company.name}</span> : null}
                      {!record.contact && !record.company ? '—' : null}
                    </td>
                    <td>
                      <Badge tone={statusTone(record.status)}>{caseLabel(record.status)}</Badge>
                    </td>
                    <td>
                      <Badge tone={priorityTone(record.priority)}>
                        {caseLabel(record.priority)}
                      </Badge>
                    </td>
                    <td>
                      <span className="cases-assignee" title={personName(record.assignedUser)}>
                        {record.assignedUser ? (
                          <Avatar
                            fallback={initials(record.assignedUser)}
                            label={personName(record.assignedUser)}
                            size="sm"
                          />
                        ) : null}
                        <span>{personName(record.assignedUser)}</span>
                      </span>
                    </td>
                    <td className={isOverdue(record) ? 'overdue-text' : ''}>
                      {record.dueAt ? formatDateTime(record.dueAt) : '—'}
                    </td>
                    <td>{formatDate(record.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="cases-mobile-list" aria-label="Cases">
            {records.map((record) => (
              <article key={record.id}>
                <Link href={`/app/cases/${record.id}`}>
                  <strong>{record.caseNumber}</strong>
                  <span>{record.title}</span>
                </Link>
                <div>
                  <Badge tone={statusTone(record.status)}>{caseLabel(record.status)}</Badge>
                  <Badge tone={priorityTone(record.priority)}>{caseLabel(record.priority)}</Badge>
                </div>
                <small>
                  {customerName(record)} · {personName(record.assignedUser)}
                </small>
                <small className={isOverdue(record) ? 'overdue-text' : ''}>
                  {record.dueAt ? `Due ${formatDateTime(record.dueAt)}` : 'No due date'}
                </small>
              </article>
            ))}
          </div>
        </>
      )}
      <Pagination currentPage={meta.page} totalPages={meta.totalPages} onPageChange={setPage} />
    </div>
  );
}

function statusTone(status: CustomerCase['status']) {
  if (status === 'RESOLVED' || status === 'CLOSED') return 'success' as const;
  if (status.startsWith('WAITING')) return 'warning' as const;
  return 'neutral' as const;
}
function priorityTone(priority: CustomerCase['priority']) {
  if (priority === 'URGENT') return 'danger' as const;
  if (priority === 'HIGH') return 'warning' as const;
  return 'neutral' as const;
}
function personName(person: CustomerCase['assignedUser']) {
  return person ? `${person.firstName} ${person.lastName}` : 'Unassigned';
}
function initials(person: NonNullable<CustomerCase['assignedUser']>) {
  return `${person.firstName[0] ?? ''}${person.lastName[0] ?? ''}`.toUpperCase();
}
function customerName(record: CustomerCase) {
  return record.contact
    ? `${record.contact.firstName} ${record.contact.lastName}`
    : (record.company?.name ?? 'No customer');
}
function isOverdue(record: CustomerCase) {
  return Boolean(
    record.dueAt &&
    new Date(record.dueAt) < new Date() &&
    !['RESOLVED', 'CLOSED'].includes(record.status),
  );
}
function formatDate(value: string) {
  return new Date(value).toLocaleDateString([], { dateStyle: 'medium' });
}
function formatDateTime(value: string) {
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}
