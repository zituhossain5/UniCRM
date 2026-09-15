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
import { Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { CaseCreateSheet } from './case-create-sheet';

const views = ['all', 'mine', 'unassigned', 'open', 'waiting', 'overdue', 'resolved'] as const;

export function CasesView({ initialView = 'all' }: { initialView?: string }) {
  const current = useCurrentUser();
  const { users } = useCrmReferenceData({ users: current.permissions.includes('user.read') });
  const [records, setRecords] = useState<CustomerCase[]>();
  const [meta, setMeta] = useState<PaginationMeta>({ page: 1, limit: 25, total: 0, totalPages: 1 });
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
  const [error, setError] = useState('');

  const load = useCallback(async () => {
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
    try {
      setError('');
      const result = await apiRequest<{ data: CustomerCase[]; meta: PaginationMeta }>(
        `/cases?${params}`,
      );
      setRecords(result.data);
      setMeta(result.meta);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load cases.');
    }
  }, [assignee, company, contact, dueFrom, dueTo, page, priority, search, status, type, view]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);
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
              onCreated={() => void load()}
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
          value={priority}
          onValueChange={filter(setPriority)}
          options={[
            { value: '', label: 'All priorities' },
            ...casePriorities.map((value) => ({ value, label: caseLabel(value) })),
          ]}
        />
        <Select
          value={type}
          onValueChange={filter(setType)}
          options={[
            { value: '', label: 'All types' },
            ...caseTypes.map((value) => ({ value, label: caseLabel(value) })),
          ]}
        />
        {users.length ? (
          <Select
            value={assignee}
            onValueChange={filter(setAssignee)}
            options={[{ value: '', label: 'All assignees' }, ...userOptions(users)]}
          />
        ) : null}
        <Select
          value={company}
          onValueChange={filter(setCompany)}
          options={[
            { value: '', label: 'All companies' },
            ...references.companies.map((item) => ({ value: item.id, label: item.name })),
          ]}
        />
        <Select
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
      {error ? (
        <ErrorState
          title="Cases unavailable"
          description={error}
          action={<Button onClick={() => void load()}>Retry</Button>}
        />
      ) : !records ? (
        <LoadingState label="Loading cases" />
      ) : !records.length ? (
        <EmptyState
          title="No cases found"
          description="Create a case or adjust the current filters."
        />
      ) : (
        <div className="data-table-shell">
          <table className="data-table">
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
                  <td>
                    <Link className="record-link" href={`/app/cases/${record.id}`}>
                      <strong>{record.caseNumber}</strong>
                      <span>{record.title}</span>
                    </Link>
                  </td>
                  <td>
                    {record.company?.name ??
                      (record.contact
                        ? `${record.contact.firstName} ${record.contact.lastName}`
                        : '—')}
                  </td>
                  <td>
                    <Badge
                      tone={
                        ['RESOLVED', 'CLOSED'].includes(record.status)
                          ? 'success'
                          : record.status.startsWith('WAITING')
                            ? 'warning'
                            : 'neutral'
                      }
                    >
                      {caseLabel(record.status)}
                    </Badge>
                  </td>
                  <td>
                    <Badge
                      tone={
                        record.priority === 'URGENT'
                          ? 'danger'
                          : record.priority === 'HIGH'
                            ? 'warning'
                            : 'neutral'
                      }
                    >
                      {caseLabel(record.priority)}
                    </Badge>
                  </td>
                  <td>
                    {record.assignedUser
                      ? `${record.assignedUser.firstName} ${record.assignedUser.lastName}`
                      : 'Unassigned'}
                  </td>
                  <td
                    className={
                      record.dueAt &&
                      new Date(record.dueAt) < new Date() &&
                      !['RESOLVED', 'CLOSED'].includes(record.status)
                        ? 'overdue-text'
                        : ''
                    }
                  >
                    {record.dueAt ? new Date(record.dueAt).toLocaleString() : '—'}
                  </td>
                  <td>{new Date(record.updatedAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination currentPage={meta.page} totalPages={meta.totalPages} onPageChange={setPage} />
    </div>
  );
}
