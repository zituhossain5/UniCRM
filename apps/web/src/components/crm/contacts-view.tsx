'use client';
import { AuthMessage } from '@/components/auth-screen';
import { useCurrentUser } from '@/components/auth-provider';
import { ContactCreateSheet } from '@/components/crm/create-sheets';
import { MetadataListControls, SavedViewsBar } from '@/components/configuration/list-configuration';
import { apiRequest } from '@/lib/api';
import { onCrmDataChanged } from '@/lib/crm-events';
import { type CompanyRecord, type ContactRecord, type PaginationMeta } from '@/lib/crm-types';
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
import { Plus, Search, Users } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

export function ContactsView() {
  const current = useCurrentUser();
  const [contacts, setContacts] = useState<ContactRecord[]>();
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({ page: 1, limit: 25, total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const [company, setCompany] = useState('');
  const [sorting, setSorting] = useState('lastName:asc');
  const [tag, setTag] = useState('');
  const [customFields, setCustomFields] = useState<Record<string, unknown>>({});
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const canCreate = current.permissions.includes('contact.create');
  const load = useCallback(async () => {
    try {
      setError('');
      const [sort, order] = sorting.split(':');
      const p = new URLSearchParams({ page: String(page), limit: '25' });
      p.set('sort', sort!);
      p.set('order', order!);
      if (search.trim()) p.set('search', search.trim());
      if (company) p.set('company', company);
      if (tag) p.set('tag', tag);
      if (
        Object.keys(customFields).length &&
        Object.values(customFields).every((value) => value !== '')
      )
        p.set('customFields', JSON.stringify(customFields));
      const result = await apiRequest<{ data: ContactRecord[]; meta: PaginationMeta }>(
        `/contacts?${p}`,
      );
      setContacts(result.data);
      setMeta(result.meta);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load contacts.');
    }
  }, [company, customFields, page, search, sorting, tag]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 250);
    return () => clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    void apiRequest<{ data: CompanyRecord[] }>('/companies?limit=100&sort=name&order=asc')
      .then((r) => setCompanies(r.data))
      .catch(() => undefined);
  }, []);
  useEffect(
    () =>
      onCrmDataChanged(['companies'], () => {
        void apiRequest<{ data: CompanyRecord[] }>('/companies?limit=100&sort=name&order=asc')
          .then((r) => setCompanies(r.data))
          .catch(() => undefined);
      }),
    [],
  );
  useEffect(() => onCrmDataChanged(['contacts'], () => void load()), [load]);
  const applySavedView = useCallback(
    (
      filters: Record<string, unknown>,
      savedSort: { field: string; order: 'asc' | 'desc' } | null,
    ) => {
      setSearch(typeof filters.search === 'string' ? filters.search : '');
      setCompany(typeof filters.company === 'string' ? filters.company : '');
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
        title="Contacts"
        description={`${meta.total} people`}
        actions={
          canCreate ? (
            <ContactCreateSheet
              open={open}
              onOpenChange={setOpen}
              onCreated={load}
              trigger={
                <Button>
                  <Plus size={15} />
                  New contact
                </Button>
              }
            />
          ) : undefined
        }
      />
      <SavedViewsBar
        entityType="CONTACT"
        filters={{ search, company, tag, customFields }}
        sort={{ field: sortField, order: sortOrder }}
        onApply={applySavedView}
      />
      <div className="crm-toolbar">
        <label className="crm-search">
          <Search size={15} />
          <Input
            aria-label="Search contacts"
            placeholder="Search contacts..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <Select
          value={company || null}
          onValueChange={(v) => {
            setCompany(v ?? '');
            setPage(1);
          }}
          options={[
            { label: 'All companies', value: '' },
            ...companies.map((c) => ({ label: c.name, value: c.id })),
          ]}
          placeholder="Company"
        />
        <MetadataListControls
          entityType="CONTACT"
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
        <Select
          value={sorting}
          onValueChange={(value) => {
            if (!value) return;
            setSorting(value);
            setPage(1);
          }}
          options={[
            { label: 'Last name A-Z', value: 'lastName:asc' },
            { label: 'First name A-Z', value: 'firstName:asc' },
            { label: 'Newest', value: 'createdAt:desc' },
            { label: 'Recently updated', value: 'updatedAt:desc' },
          ]}
        />
      </div>
      {error && !contacts ? (
        <ErrorState
          description={error}
          action={
            <Button onClick={() => void load()} variant="outline">
              Try again
            </Button>
          }
        />
      ) : null}
      {!contacts && !error ? <LoadingState label="Loading contacts" /> : null}
      {error && contacts ? <AuthMessage>{error}</AuthMessage> : null}
      {contacts?.length === 0 ? (
        <EmptyState
          icon={<Users size={20} />}
          title="No contacts yet"
          description="Add the people involved in your prospect and client relationships."
          action={
            canCreate ? <Button onClick={() => setOpen(true)}>Create contact</Button> : undefined
          }
        />
      ) : null}
      {contacts?.length ? (
        <div className="crm-table-wrap">
          <table className="crm-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Company</th>
                <th>Job title</th>
                <th>Email</th>
                <th>Phone</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact) => (
                <tr key={contact.id}>
                  <td>
                    <Link className="crm-record-link" href={`/app/contacts/${contact.id}`}>
                      <strong>
                        {contact.firstName} {contact.lastName}
                      </strong>
                      {contact.isPrimary ? <span>Primary contact</span> : null}
                      {contact.tags?.length ? (
                        <span className="record-tags">
                          {contact.tags.map((item) => (
                            <Badge key={item.id} tone="neutral">
                              {item.name}
                            </Badge>
                          ))}
                        </span>
                      ) : null}
                    </Link>
                  </td>
                  <td>
                    {contact.company ? (
                      <Link href={`/app/companies/${contact.company.id}`}>
                        {contact.company.name}
                      </Link>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td>{contact.jobTitle || '-'}</td>
                  <td>
                    {contact.email ? <a href={`mailto:${contact.email}`}>{contact.email}</a> : '-'}
                  </td>
                  <td>{contact.phone || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {contacts?.length ? (
        <Pagination currentPage={meta.page} totalPages={meta.totalPages} onPageChange={setPage} />
      ) : null}
    </div>
  );
}
