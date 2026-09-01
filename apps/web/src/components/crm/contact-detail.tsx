'use client';
import { AuthMessage } from '@/components/auth-screen';
import { useCurrentUser } from '@/components/auth-provider';
import { apiRequest } from '@/lib/api';
import type { CompanyRecord, ContactRecord } from '@/lib/crm-types';
import {
  Badge,
  Button,
  ConfirmationDialog,
  ErrorState,
  Input,
  LoadingState,
  PageHeader,
  Select,
  Sheet,
  Textarea,
} from '@unicrm/ui';
import { Archive, ArrowLeft, Pencil } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';

const EDIT_CONTACT_FORM_ID = 'edit-contact-form';

export function ContactDetail({ id }: { id: string }) {
  const router = useRouter();
  const current = useCurrentUser();
  const [contact, setContact] = useState<ContactRecord>();
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    try {
      setError('');
      setContact((await apiRequest<{ data: ContactRecord }>(`/contacts/${id}`)).data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load contact.');
    }
  }, [id]);
  useEffect(() => {
    void load();
    void apiRequest<{ data: CompanyRecord[] }>('/companies?limit=100&sort=name&order=asc')
      .then((r) => setCompanies(r.data))
      .catch(() => undefined);
  }, [load]);
  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries([...form.entries()].filter(([, v]) => v !== ''));
    try {
      await apiRequest(`/contacts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...payload, isPrimary: form.get('isPrimary') === 'on' }),
      });
      setOpen(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Contact update failed.');
    } finally {
      setSaving(false);
    }
  }
  async function archive() {
    try {
      setError('');
      await apiRequest(`/contacts/${id}`, { method: 'DELETE' });
      router.push('/app/contacts');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Contact archival failed.');
    }
  }
  if (!contact && !error) return <LoadingState label="Loading contact" />;
  if (!contact)
    return (
      <ErrorState
        description={error}
        action={
          <Button onClick={() => void load()} variant="outline">
            Try again
          </Button>
        }
      />
    );
  return (
    <div className="crm-page crm-record-page">
      <Link className="crm-back" href="/app/contacts">
        <ArrowLeft size={14} />
        Contacts
      </Link>
      <PageHeader
        title={`${contact.firstName} ${contact.lastName}`}
        description={contact.jobTitle || contact.company?.name || 'Contact'}
        actions={
          !contact.archivedAt &&
          (current.permissions.includes('contact.update') ||
            current.permissions.includes('contact.delete')) ? (
            <div className="record-actions">
              {current.permissions.includes('contact.update') ? (
                <Sheet
                  open={open}
                  onOpenChange={setOpen}
                  title="Edit contact"
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
                      <Button form={EDIT_CONTACT_FORM_ID} loading={saving} type="submit">
                        Save changes
                      </Button>
                    </>
                  }
                  trigger={
                    <Button variant="outline">
                      <Pencil size={14} />
                      Edit
                    </Button>
                  }
                >
                  <form
                    className="dialog-form"
                    id={EDIT_CONTACT_FORM_ID}
                    onSubmit={(event) => void update(event)}
                  >
                    <div className="form-two-columns">
                      <label>
                        <span>First name</span>
                        <Input name="firstName" defaultValue={contact.firstName} required />
                      </label>
                      <label>
                        <span>Last name</span>
                        <Input name="lastName" defaultValue={contact.lastName} required />
                      </label>
                    </div>
                    <Select
                      label="Company"
                      name="companyId"
                      defaultValue={contact.company?.id}
                      options={companies.map((c) => ({ label: c.name, value: c.id }))}
                      placeholder="No company"
                    />
                    <label>
                      <span>Job title</span>
                      <Input name="jobTitle" defaultValue={contact.jobTitle ?? ''} />
                    </label>
                    <div className="form-two-columns">
                      <label>
                        <span>Email</span>
                        <Input name="email" type="email" defaultValue={contact.email ?? ''} />
                      </label>
                      <label>
                        <span>Phone</span>
                        <Input name="phone" defaultValue={contact.phone ?? ''} />
                      </label>
                    </div>
                    <label className="native-check">
                      <input name="isPrimary" type="checkbox" defaultChecked={contact.isPrimary} />
                      <span>Primary contact for company</span>
                    </label>
                    <label>
                      <span>Notes</span>
                      <Textarea name="notes" defaultValue={contact.notes ?? ''} />
                    </label>
                  </form>
                </Sheet>
              ) : null}
              {current.permissions.includes('contact.delete') ? (
                <ConfirmationDialog
                  title="Archive contact"
                  description="The contact will leave active lists while existing lead history remains intact."
                  confirmLabel="Archive"
                  onConfirm={() => void archive()}
                  trigger={
                    <Button variant="outline">
                      <Archive size={14} />
                      Archive
                    </Button>
                  }
                />
              ) : null}
            </div>
          ) : undefined
        }
      />
      {error ? <AuthMessage>{error}</AuthMessage> : null}
      <div className="record-grid">
        <section className="record-section">
          <h2>Contact details</h2>
          <dl className="detail-list">
            <Detail
              label="Company"
              value={
                contact.company ? (
                  <Link href={`/app/companies/${contact.company.id}`}>{contact.company.name}</Link>
                ) : (
                  '-'
                )
              }
            />
            <Detail label="Job title" value={contact.jobTitle || '-'} />
            <Detail
              label="Email"
              value={contact.email ? <a href={`mailto:${contact.email}`}>{contact.email}</a> : '-'}
            />
            <Detail label="Phone" value={contact.phone || '-'} />
            <Detail label="Alternate phone" value={contact.alternatePhone || '-'} />
            <Detail
              label="Relationship"
              value={contact.isPrimary ? <Badge tone="primary">Primary contact</Badge> : 'Contact'}
            />
            <Detail label="Notes" value={contact.notes || '-'} />
          </dl>
        </section>
        <section className="record-section">
          <h2>Associated leads</h2>
          {contact.leads?.length ? (
            <div className="compact-list">
              {contact.leads.map((lead) => (
                <Link href={`/app/leads/${lead.id}`} key={lead.id}>
                  <strong>{lead.title}</strong>
                  <span>{lead.stage.name}</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="record-empty">No active leads associated with this contact.</p>
          )}
        </section>
      </div>
    </div>
  );
}
function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
