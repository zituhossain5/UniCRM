'use client';

import { useCurrentUser } from '@/components/auth-provider';
import {
  AdditionalInformationFields,
  configurableRecordPayload,
  RecordMetadataSummary,
  useRecordConfiguration,
} from '@/components/configuration/record-configuration';
import { apiRequest } from '@/lib/api';
import {
  formatMoney,
  labelize,
  leadPriorities,
  personName,
  type CompanyRecord,
  type ContactRecord,
  type DealRecord,
  type PersonRef,
  type Pipeline,
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
import { Archive, ArrowLeft, BriefcaseBusiness, FileText } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

const EDIT_FORM_ID = 'edit-deal-form';

export function DealDetail({ id }: { id: string }) {
  const current = useCurrentUser();
  const router = useRouter();
  const [deal, setDeal] = useState<DealRecord>();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [users, setUsers] = useState<PersonRef[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const configuration = useRecordConfiguration('DEAL');
  const load = useCallback(async () => {
    try {
      setError('');
      setDeal((await apiRequest<{ data: DealRecord }>(`/deals/${id}`)).data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load deal.');
    }
  }, [id]);
  useEffect(() => {
    void load();
    void Promise.all([
      apiRequest<{ data: Pipeline[] }>('/pipelines?entityType=DEAL'),
      apiRequest<{ data: CompanyRecord[] }>('/companies?limit=100&sort=name&order=asc'),
      apiRequest<{ data: ContactRecord[] }>('/contacts?limit=100&sort=lastName&order=asc'),
    ])
      .then(([p, c, contactsResult]) => {
        setPipelines(p.data);
        setCompanies(c.data);
        setContacts(contactsResult.data);
      })
      .catch(() => undefined);
    if (current.permissions.includes('user.read'))
      void apiRequest<{ data: PersonRef[] }>('/users')
        .then((result) => setUsers(result.data.filter(({ status }) => status === 'ACTIVE')))
        .catch(() => undefined);
  }, [current.permissions, load]);
  async function mutate(path: string, init: RequestInit) {
    setBusy(true);
    setError('');
    try {
      await apiRequest(path, init);
      await load();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The update failed.');
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function changeStage(stageId: string | null) {
    if (!stageId || !deal || stageId === deal.stageId) return;
    const stage = pipelines
      .find(({ id: pipelineId }) => pipelineId === deal.pipelineId)
      ?.stages.find(({ id: value }) => value === stageId);
    let lostReason: string | undefined;
    if (stage?.isLost) {
      lostReason = window.prompt('Reason this deal was lost')?.trim();
      if (!lostReason) return;
    }
    await mutate(`/deals/${id}/stage`, {
      method: 'PATCH',
      body: JSON.stringify({ stageId, lostReason }),
    });
  }
  async function edit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = configurableRecordPayload(event.currentTarget, configuration.definitions);
    if (await mutate(`/deals/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }))
      setEditOpen(false);
  }
  async function createProject() {
    if (await mutate(`/deals/${id}/project`, { method: 'POST', body: '{}' })) {
      const updated = (await apiRequest<{ data: DealRecord }>(`/deals/${id}`)).data;
      if (updated.project) router.push(`/app/projects/${updated.project.id}`);
    }
  }
  async function archive() {
    if (await mutate(`/deals/${id}`, { method: 'DELETE' })) router.push('/app/deals');
  }
  if (!deal && !error) return <LoadingState label="Loading deal" />;
  if (!deal)
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
  const stages =
    pipelines.find(({ id: pipelineId }) => pipelineId === deal.pipelineId)?.stages ?? [];
  return (
    <div className="crm-page crm-record-page">
      <Link className="crm-back" href="/app/deals">
        <ArrowLeft size={14} />
        Deals
      </Link>
      <PageHeader
        title={deal.name}
        description={deal.company.name}
        actions={
          <div className="record-actions">
            {current.permissions.includes('quotation.create') ? (
              <Link
                className="ui-button ui-button--secondary"
                href={`/app/quotations/new?companyId=${deal.companyId}&contactId=${deal.contactId ?? ''}&dealId=${deal.id}&currency=${deal.currency}`}
              >
                <FileText size={15} />
                Create quotation
              </Link>
            ) : null}
            {deal.stage.isWon && !deal.project && current.permissions.includes('project.create') ? (
              <Button loading={busy} onClick={() => void createProject()}>
                <BriefcaseBusiness size={15} />
                Create project
              </Button>
            ) : null}
            {current.permissions.includes('deal.update') ? (
              <Sheet
                open={editOpen}
                onOpenChange={setEditOpen}
                title="Edit deal"
                trigger={<Button variant="outline">Edit</Button>}
                footer={
                  <>
                    <Button disabled={busy} onClick={() => setEditOpen(false)} variant="secondary">
                      Cancel
                    </Button>
                    <Button form={EDIT_FORM_ID} loading={busy} type="submit">
                      Save changes
                    </Button>
                  </>
                }
              >
                <form
                  className="dialog-form"
                  id={EDIT_FORM_ID}
                  onSubmit={(event) => void edit(event)}
                >
                  <label>
                    <span>Deal name</span>
                    <Input defaultValue={deal.name} name="name" required />
                  </label>
                  <Select
                    defaultValue={deal.companyId}
                    label="Company"
                    name="companyId"
                    options={companies.map(({ id: companyId, name }) => ({
                      label: name,
                      value: companyId,
                    }))}
                  />
                  <Select
                    defaultValue={deal.contactId ?? ''}
                    label="Contact"
                    name="contactId"
                    options={[
                      { label: 'No contact', value: '' },
                      ...contacts.map((contact) => ({
                        label: `${contact.firstName} ${contact.lastName}`,
                        value: contact.id,
                      })),
                    ]}
                  />
                  <div className="form-two-columns">
                    <label>
                      <span>Amount</span>
                      <Input
                        defaultValue={deal.amount ?? ''}
                        min="0"
                        name="amount"
                        step="0.01"
                        type="number"
                      />
                    </label>
                    <label>
                      <span>Probability</span>
                      <Input
                        defaultValue={deal.probability}
                        max="100"
                        min="0"
                        name="probability"
                        type="number"
                      />
                    </label>
                  </div>
                  <label>
                    <span>Expected close</span>
                    <Input
                      defaultValue={deal.expectedCloseDate?.slice(0, 10) ?? ''}
                      name="expectedCloseDate"
                      type="date"
                    />
                  </label>
                  <Select
                    defaultValue={deal.priority}
                    label="Priority"
                    name="priority"
                    options={leadPriorities.map((value) => ({ label: labelize(value), value }))}
                  />
                  {current.permissions.includes('deal.assign') && users.length ? (
                    <Select
                      defaultValue={deal.ownerId ?? ''}
                      label="Owner"
                      name="ownerId"
                      options={[
                        { label: 'Unassigned', value: '' },
                        ...users.map((user) => ({ label: personName(user), value: user.id })),
                      ]}
                    />
                  ) : null}
                  <label>
                    <span>Description</span>
                    <Textarea defaultValue={deal.description ?? ''} name="description" />
                  </label>
                  <AdditionalInformationFields
                    definitions={configuration.definitions}
                    entries={deal.customFields}
                    tags={configuration.tags}
                    selectedTags={deal.tags}
                  />
                </form>
              </Sheet>
            ) : null}
            {current.permissions.includes('deal.delete') ? (
              <ConfirmationDialog
                title="Archive deal?"
                description="The deal will be removed from active views while its history remains available."
                confirmLabel="Archive"
                onConfirm={() => void archive()}
                trigger={
                  <Button variant="ghost">
                    <Archive size={15} />
                    Archive
                  </Button>
                }
              />
            ) : null}
          </div>
        }
      />
      {error ? <p className="form-error">{error}</p> : null}
      <section className="record-section">
        <div className="record-section-heading">
          <h2>Deal overview</h2>
          {current.permissions.includes('deal.stage.update') ? (
            <Select
              aria-label="Deal stage"
              value={deal.stageId}
              onValueChange={(value) => void changeStage(value)}
              options={stages.map(({ id: stageId, name }) => ({ label: name, value: stageId }))}
            />
          ) : (
            <Badge tone={deal.stage.isWon ? 'success' : deal.stage.isLost ? 'danger' : 'primary'}>
              {deal.stage.name}
            </Badge>
          )}
        </div>
        <dl className="detail-list">
          <div>
            <dt>Company</dt>
            <dd>
              <Link href={`/app/companies/${deal.companyId}`}>{deal.company.name}</Link>
            </dd>
          </div>
          <div>
            <dt>Contact</dt>
            <dd>{deal.contact ? `${deal.contact.firstName} ${deal.contact.lastName}` : '-'}</dd>
          </div>
          <div>
            <dt>Value</dt>
            <dd>{formatMoney(deal.amount, deal.currency)}</dd>
          </div>
          <div>
            <dt>Probability</dt>
            <dd>{deal.probability}%</dd>
          </div>
          <div>
            <dt>Owner</dt>
            <dd>{personName(deal.owner)}</dd>
          </div>
          <div>
            <dt>Expected close</dt>
            <dd>
              {deal.expectedCloseDate ? new Date(deal.expectedCloseDate).toLocaleDateString() : '-'}
            </dd>
          </div>
          <div>
            <dt>Priority</dt>
            <dd>{labelize(deal.priority)}</dd>
          </div>
          {deal.lostReason ? (
            <div>
              <dt>Lost reason</dt>
              <dd>{deal.lostReason}</dd>
            </div>
          ) : null}
        </dl>
      </section>
      <RecordMetadataSummary entries={deal.customFields} tags={deal.tags} />
      {deal.project ? (
        <section className="record-section">
          <h2>Project</h2>
          <Link href={`/app/projects/${deal.project.id}`}>{deal.project.name}</Link>
        </section>
      ) : null}
      {deal.quotations?.length ? (
        <section className="record-section">
          <h2>Quotations</h2>
          {deal.quotations.map((quotation) => (
            <Link
              className="related-record-row"
              href={`/app/quotations/${quotation.id}`}
              key={quotation.id}
            >
              <span>{quotation.quotationNumber}</span>
              <span>{formatMoney(quotation.total, quotation.currency)}</span>
              <Badge tone="neutral">{labelize(quotation.status)}</Badge>
            </Link>
          ))}
        </section>
      ) : null}
      <section className="record-section">
        <h2>Activity</h2>
        {deal.activities?.length ? (
          <div className="activity-list">
            {deal.activities.map((activity) => (
              <article key={activity.id}>
                <strong>{labelize(activity.action)}</strong>
                <span>
                  {activity.actor ? personName(activity.actor) : 'System'} ·{' '}
                  {new Date(activity.createdAt).toLocaleString()}
                </span>
              </article>
            ))}
          </div>
        ) : (
          <p>No activity yet.</p>
        )}
      </section>
    </div>
  );
}
