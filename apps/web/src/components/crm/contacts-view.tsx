'use client';
import { AuthMessage } from '@/components/auth-screen';
import { useCurrentUser } from '@/components/auth-provider';
import { apiRequest } from '@/lib/api';
import { type CompanyRecord, type ContactRecord, type PaginationMeta } from '@/lib/crm-types';
import {
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
import { Plus, Search, Users } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

const CREATE_CONTACT_FORM_ID = 'create-contact-form';

export function ContactsView() {
  const current = useCurrentUser();
  const [contacts, setContacts] = useState<ContactRecord[]>();
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({ page: 1, limit: 25, total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const [company, setCompany] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const canCreate = current.permissions.includes('contact.create');
  const load = useCallback(async () => {
    try {
      setError('');
      const p = new URLSearchParams({
        page: String(page),
        limit: '25',
        sort: 'lastName',
        order: 'asc',
      });
      if (search.trim()) p.set('search', search.trim());
      if (company) p.set('company', company);
      const result = await apiRequest<{ data: ContactRecord[]; meta: PaginationMeta }>(
        `/contacts?${p}`,
      );
      setContacts(result.data);
      setMeta(result.meta);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load contacts.');
    }
  }, [company, page, search]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 250);
    return () => clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    void apiRequest<{ data: CompanyRecord[] }>('/companies?limit=100&sort=name&order=asc')
      .then((r) => setCompanies(r.data))
      .catch(() => undefined);
  }, []);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries([...form.entries()].filter(([, v]) => v !== ''));
    try {
      await apiRequest('/contacts', {
        method: 'POST',
        body: JSON.stringify({ ...payload, isPrimary: form.get('isPrimary') === 'on' }),
      });
      setOpen(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Contact creation failed.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="crm-page">
      <PageHeader
        title="Contacts"
        description={`${meta.total} people`}
        actions={
          canCreate ? (
            <Sheet
              open={open}
              onOpenChange={setOpen}
              title="New contact"
              description="A contact may be linked to a company now or later."
              footer={
                <>
                  <Button
                    disabled={saving}
                    onClick={() => setOpen(false)}
                    type="button"
                    variant="secondary"
                  >
                    Cancel
                  </Button>
                  <Button form={CREATE_CONTACT_FORM_ID} loading={saving} type="submit">
                    Create contact
                  </Button>
                </>
              }
              trigger={
                <Button>
                  <Plus size={15} />
                  New contact
                </Button>
              }
            >
              <ContactForm companies={companies} onSubmit={(event) => void create(event)} />
            </Sheet>
          ) : undefined
        }
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
function ContactForm({
  companies,
  onSubmit,
}: {
  companies: CompanyRecord[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="dialog-form" id={CREATE_CONTACT_FORM_ID} onSubmit={onSubmit}>
      <div className="form-two-columns">
        <label>
          <span>First name</span>
          <Input name="firstName" required />
        </label>
        <label>
          <span>Last name</span>
          <Input name="lastName" required />
        </label>
      </div>
      <Select
        label="Company"
        name="companyId"
        options={companies.map((c) => ({ label: c.name, value: c.id }))}
        placeholder="No company"
      />
      <label>
        <span>Job title</span>
        <Input name="jobTitle" />
      </label>
      <div className="form-two-columns">
        <label>
          <span>Email</span>
          <Input name="email" type="email" />
        </label>
        <label>
          <span>Phone</span>
          <Input name="phone" />
        </label>
      </div>
      <label className="native-check">
        <input name="isPrimary" type="checkbox" />
        <span>Primary contact for company</span>
      </label>
    </form>
  );
}
