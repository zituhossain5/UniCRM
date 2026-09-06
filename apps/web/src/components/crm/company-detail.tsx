'use client';
import { AuthMessage } from '@/components/auth-screen';
import {
  AdditionalInformationFields,
  configurableRecordPayload,
  RecordMetadataSummary,
  useRecordConfiguration,
} from '@/components/configuration/record-configuration';
import { useCurrentUser } from '@/components/auth-provider';
import { apiRequest } from '@/lib/api';
import {
  companyStatuses,
  formatMoney,
  labelize,
  personName,
  type CompanyRecord,
} from '@/lib/crm-types';
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
import { Archive, ArrowLeft, ExternalLink, Pencil, Plus } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';

const EDIT_COMPANY_FORM_ID = 'edit-company-form';

export function CompanyDetail({ id }: { id: string }) {
  const current = useCurrentUser();
  const [company, setCompany] = useState<CompanyRecord>();
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const configuration = useRecordConfiguration('COMPANY');
  const load = useCallback(async () => {
    try {
      setError('');
      setCompany((await apiRequest<{ data: CompanyRecord }>(`/companies/${id}`)).data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load company.');
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);
  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const payload = configurableRecordPayload(event.currentTarget, configuration.definitions);
    try {
      await apiRequest(`/companies/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      setOpen(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Company update failed.');
    } finally {
      setSaving(false);
    }
  }
  async function archive() {
    try {
      setError('');
      await apiRequest(`/companies/${id}`, { method: 'DELETE' });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Company archival failed.');
    }
  }
  if (!company && !error) return <LoadingState label="Loading company" />;
  if (!company)
    return (
      <ErrorState
        description={error}
        action={
          <Button variant="outline" onClick={() => void load()}>
            Try again
          </Button>
        }
      />
    );
  return (
    <div className="crm-page crm-record-page">
      <Link className="crm-back" href="/app/companies">
        <ArrowLeft size={14} />
        Companies
      </Link>
      <PageHeader
        title={company.name}
        description={
          <Badge tone={company.status === 'ACTIVE_CLIENT' ? 'success' : 'primary'}>
            {labelize(company.status)}
          </Badge>
        }
        actions={
          company.status !== 'ARCHIVED' &&
          (current.permissions.includes('company.update') ||
            current.permissions.includes('company.delete') ||
            current.permissions.includes('quotation.create') ||
            current.permissions.includes('payment.create')) ? (
            <div className="record-actions">
              {current.permissions.includes('quotation.create') ? (
                <Link
                  className="ui-button ui-button--secondary"
                  href={`/app/quotations/new?companyId=${company.id}`}
                >
                  <Plus size={14} /> New quotation
                </Link>
              ) : null}
              {current.permissions.includes('payment.create') ? (
                <Link
                  className="ui-button ui-button--secondary"
                  href={`/app/payments?record=1&companyId=${company.id}`}
                >
                  <Plus size={14} /> Record payment
                </Link>
              ) : null}
              {current.permissions.includes('company.update') && company.status !== 'ARCHIVED' ? (
                <Sheet
                  open={open}
                  onOpenChange={setOpen}
                  title="Edit company"
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
                      <Button form={EDIT_COMPANY_FORM_ID} loading={saving} type="submit">
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
                    id={EDIT_COMPANY_FORM_ID}
                    onSubmit={(event) => void update(event)}
                  >
                    <label>
                      <span>Company name</span>
                      <Input name="name" defaultValue={company.name} required />
                    </label>
                    <label>
                      <span>Website</span>
                      <Input name="website" type="url" defaultValue={company.website ?? ''} />
                    </label>
                    <div className="form-two-columns">
                      <label>
                        <span>Email</span>
                        <Input name="email" type="email" defaultValue={company.email ?? ''} />
                      </label>
                      <label>
                        <span>Phone</span>
                        <Input name="phone" defaultValue={company.phone ?? ''} />
                      </label>
                    </div>
                    <label>
                      <span>Industry</span>
                      <Input name="industry" defaultValue={company.industry ?? ''} />
                    </label>
                    <Select
                      label="Status"
                      name="status"
                      defaultValue={company.status}
                      options={companyStatuses.filter((status) => status.value !== 'ARCHIVED')}
                    />
                    <label>
                      <span>Notes</span>
                      <Textarea name="notes" defaultValue={company.notes ?? ''} />
                    </label>
                    <AdditionalInformationFields
                      definitions={configuration.definitions}
                      entries={company.customFields}
                      selectedTags={company.tags}
                      tags={configuration.tags}
                    />
                  </form>
                </Sheet>
              ) : null}
              {current.permissions.includes('company.delete') && company.status !== 'ARCHIVED' ? (
                <ConfirmationDialog
                  title="Archive company"
                  description="The company will leave active lists while its contacts, leads, and history remain available."
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
          <h2>Company details</h2>
          <dl className="detail-list">
            <Detail
              label="Website"
              value={
                company.website ? (
                  <a href={company.website} target="_blank" rel="noreferrer">
                    {company.website}
                    <ExternalLink size={12} />
                  </a>
                ) : (
                  '-'
                )
              }
            />
            <Detail
              label="Email"
              value={company.email ? <a href={`mailto:${company.email}`}>{company.email}</a> : '-'}
            />
            <Detail label="Phone" value={company.phone || '-'} />
            <Detail label="Industry" value={company.industry || '-'} />
            <Detail label="Account owner" value={personName(company.accountOwner)} />
            <Detail
              label="Address"
              value={
                [company.addressLine1, company.city, company.state, company.country]
                  .filter(Boolean)
                  .join(', ') || '-'
              }
            />
            <Detail label="Notes" value={company.notes || '-'} />
          </dl>
        </section>
        <RecordMetadataSummary entries={company.customFields} tags={company.tags} />
        <section className="record-section">
          <div className="section-heading">
            <h2>Contacts</h2>
            <span>{company.contacts.length}</span>
          </div>
          {company.contacts.length ? (
            <div className="compact-list">
              {company.contacts.map((contact) => (
                <Link key={contact.id} href={`/app/contacts/${contact.id}`}>
                  <strong>
                    {contact.firstName} {contact.lastName}
                  </strong>
                  <span>
                    {contact.jobTitle || contact.email || contact.phone || 'No details'}{' '}
                    {contact.isPrimary ? ' · Primary' : ''}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="record-empty">No contacts associated with this company.</p>
          )}
        </section>
        <section className="record-section record-section--wide">
          <div className="section-heading">
            <h2>Projects</h2>
            <span>{company.projects?.length ?? 0}</span>
          </div>
          {company.projects?.length ? (
            <div className="compact-list">
              {company.projects.map((project) => (
                <Link key={project.id} href={`/app/projects/${project.id}`}>
                  <strong>{project.name}</strong>
                  <span>
                    {labelize(project.status)} · {project.progress}% complete
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="record-empty">No projects associated with this company.</p>
          )}
        </section>
        <section className="record-section record-section--wide">
          <div className="section-heading">
            <h2>Commercial</h2>
            <span>
              {(company.quotations?.length ?? 0) + (company.payments?.length ?? 0)} records
            </span>
          </div>
          <div className="record-grid commercial-summary-grid">
            <div>
              <h3>Quotations</h3>
              {company.quotations?.length ? (
                <div className="compact-list">
                  {company.quotations.map((quotation) => (
                    <Link href={`/app/quotations/${quotation.id}`} key={quotation.id}>
                      <strong>{quotation.quotationNumber}</strong>
                      <span>
                        {labelize(quotation.status)} ·{' '}
                        {formatMoney(quotation.total, quotation.currency)}
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="record-empty">No quotations.</p>
              )}
            </div>
            <div>
              <h3>Payments</h3>
              {company.payments?.length ? (
                <div className="compact-list">
                  {company.payments.map((payment) => (
                    <div key={payment.id}>
                      <strong>{formatMoney(payment.amount, payment.currency)}</strong>
                      <span>
                        {payment.reference ??
                          (payment.method ? labelize(payment.method) : 'Payment')}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="record-empty">No payments.</p>
              )}
            </div>
          </div>
        </section>
        <section className="record-section record-section--wide">
          <h2>Recent activity</h2>
          {company.activity?.length ? (
            <div className="activity-list">
              {company.activity.map((item) => (
                <div className="activity-item" key={item.id}>
                  <span className="activity-dot" />
                  <div>
                    <strong>{labelize(item.action)}</strong>
                    <p>
                      {item.actor ? personName(item.actor) : 'System'} ·{' '}
                      {new Date(item.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="record-empty">No company activity yet.</p>
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
