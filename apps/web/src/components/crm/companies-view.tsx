'use client';

import { AuthMessage } from '@/components/auth-screen';
import { useCurrentUser } from '@/components/auth-provider';
import { CompanyCreateSheet } from '@/components/crm/create-sheets';
import { apiRequest } from '@/lib/api';
import { onCrmDataChanged } from '@/lib/crm-events';
import {
  companyStatuses,
  labelize,
  personName,
  type CompanyRecord,
  type PaginationMeta,
  type PersonRef,
} from '@/lib/crm-types';
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
import { Building2, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

export function CompaniesView() {
  const current = useCurrentUser();
  const [companies, setCompanies] = useState<CompanyRecord[]>();
  const [meta, setMeta] = useState<PaginationMeta>({ page: 1, limit: 25, total: 0, totalPages: 1 });
  const [users, setUsers] = useState<PersonRef[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [owner, setOwner] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const canCreate = current.permissions.includes('company.create');
  const canReadUsers = current.permissions.includes('user.read');
  const load = useCallback(async () => {
    try {
      setError('');
      const params = new URLSearchParams({
        page: String(page),
        limit: '25',
        sort: 'name',
        order: 'asc',
      });
      if (search.trim()) params.set('search', search.trim());
      if (status) params.set('status', status);
      if (owner) params.set('owner', owner);
      const result = await apiRequest<{ data: CompanyRecord[]; meta: PaginationMeta }>(
        `/companies?${params}`,
      );
      setCompanies(result.data);
      setMeta(result.meta);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load companies.');
    }
  }, [owner, page, search, status]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    if (canReadUsers)
      void apiRequest<{ data: PersonRef[] }>('/users')
        .then((result) => setUsers(result.data.filter((user) => user.status === 'ACTIVE')))
        .catch(() => undefined);
  }, [canReadUsers]);
  useEffect(() => onCrmDataChanged(['companies'], () => void load()), [load]);

  return (
    <div className="crm-page">
      <PageHeader
        title="Companies"
        description={`${meta.total} prospect and client organizations`}
        actions={
          canCreate ? (
            <CompanyCreateSheet
              open={open}
              onOpenChange={setOpen}
              onCreated={load}
              trigger={
                <Button>
                  <Plus size={15} />
                  New company
                </Button>
              }
            />
          ) : undefined
        }
      />
      <div className="crm-toolbar">
        <label className="crm-search">
          <Search size={15} />
          <Input
            aria-label="Search companies"
            placeholder="Search companies..."
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <Select
          value={status || null}
          onValueChange={(value) => {
            setStatus(value ?? '');
            setPage(1);
          }}
          options={[{ label: 'All statuses', value: '' }, ...companyStatuses]}
          placeholder="Status"
        />
        {users.length ? (
          <Select
            value={owner || null}
            onValueChange={(value) => {
              setOwner(value ?? '');
              setPage(1);
            }}
            options={[
              { label: 'All owners', value: '' },
              ...users.map((user) => ({ label: personName(user), value: user.id })),
            ]}
            placeholder="Owner"
          />
        ) : null}
      </div>
      {error && !companies ? (
        <ErrorState
          description={error}
          action={
            <Button onClick={() => void load()} variant="outline">
              Try again
            </Button>
          }
        />
      ) : null}
      {!companies && !error ? <LoadingState label="Loading companies" /> : null}
      {error && companies ? <AuthMessage>{error}</AuthMessage> : null}
      {companies?.length === 0 ? (
        <EmptyState
          icon={<Building2 size={20} />}
          title="No companies yet"
          description="Create your first company to organize prospects and client contacts."
          action={
            canCreate ? <Button onClick={() => setOpen(true)}>Create company</Button> : undefined
          }
        />
      ) : null}
      {companies?.length ? (
        <div className="crm-table-wrap">
          <table className="crm-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Primary contact</th>
                <th>Status</th>
                <th>Owner</th>
                <th>Open leads</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((company) => {
                const primary =
                  company.contacts.find((contact) => contact.isPrimary) ?? company.contacts[0];
                return (
                  <tr key={company.id}>
                    <td>
                      <Link className="crm-record-link" href={`/app/companies/${company.id}`}>
                        <strong>{company.name}</strong>
                        <span>{company.website || company.email || 'No contact details'}</span>
                      </Link>
                    </td>
                    <td>
                      {primary ? (
                        <>
                          <strong>
                            {primary.firstName} {primary.lastName}
                          </strong>
                          <small>{primary.email || primary.phone}</small>
                        </>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td>
                      <Badge
                        tone={
                          company.status === 'ACTIVE_CLIENT'
                            ? 'success'
                            : company.status === 'INACTIVE' || company.status === 'ARCHIVED'
                              ? 'neutral'
                              : 'primary'
                        }
                      >
                        {labelize(company.status)}
                      </Badge>
                    </td>
                    <td>{personName(company.accountOwner)}</td>
                    <td>{company._count.leads}</td>
                    <td>{new Date(company.updatedAt).toLocaleDateString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {companies?.length ? (
        <Pagination currentPage={meta.page} totalPages={meta.totalPages} onPageChange={setPage} />
      ) : null}
    </div>
  );
}
