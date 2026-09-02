'use client';
import { AuthMessage } from '@/components/auth-screen';
import { useCurrentUser } from '@/components/auth-provider';
import { apiRequest } from '@/lib/api';
import {
  formatMoney,
  labelize,
  leadPriorities,
  leadSources,
  personName,
  type CompanyRecord,
  type ContactRecord,
  type FollowUp,
  type LeadRecord,
  type PersonRef,
  type Pipeline,
} from '@/lib/crm-types';
import {
  Badge,
  Button,
  ConfirmationDialog,
  Dialog,
  ErrorState,
  Input,
  LoadingState,
  PageHeader,
  Select,
  Sheet,
  Textarea,
} from '@unicrm/ui';
import {
  Archive,
  ArrowLeft,
  CalendarClock,
  Check,
  Mail,
  MessageSquare,
  Phone,
  Plus,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ProjectCreateSheet } from '@/components/work/create-sheets';

const EDIT_LEAD_FORM_ID = 'edit-lead-form';

export function LeadDetail({ id }: { id: string }) {
  const router = useRouter();
  const current = useCurrentUser();
  const [lead, setLead] = useState<LeadRecord>();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [users, setUsers] = useState<PersonRef[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [followOpen, setFollowOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [reschedule, setReschedule] = useState<FollowUp>();
  const load = useCallback(async () => {
    try {
      setError('');
      setLead((await apiRequest<{ data: LeadRecord }>(`/leads/${id}`)).data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load lead.');
    }
  }, [id]);
  useEffect(() => {
    void load();
    void Promise.all([
      apiRequest<{ data: Pipeline[] }>('/pipelines'),
      apiRequest<{ data: CompanyRecord[] }>('/companies?limit=100&sort=name&order=asc'),
      apiRequest<{ data: ContactRecord[] }>('/contacts?limit=100&sort=lastName&order=asc'),
    ])
      .then(([p, c, k]) => {
        setPipelines(p.data);
        setCompanies(c.data);
        setContacts(k.data);
      })
      .catch(() => undefined);
    if (current.permissions.includes('user.read'))
      void apiRequest<{ data: PersonRef[] }>('/users')
        .then((r) => setUsers(r.data.filter((user) => user.status === 'ACTIVE')))
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
    if (!stageId || !lead || stageId === lead.stageId) return;
    const stage = stages.find((s) => s.id === stageId);
    let lostReason: string | undefined;
    if (stage?.isLost) {
      lostReason = window.prompt('Reason this lead was lost')?.trim();
      if (!lostReason) return;
    }
    await mutate(`/leads/${id}/stage`, {
      method: 'PATCH',
      body: JSON.stringify({ stageId, lostReason }),
    });
  }
  async function submitActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (
      await mutate(`/leads/${id}/activities`, {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(form)),
      })
    )
      setActivityOpen(false);
  }
  async function submitFollow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries([...form.entries()].filter(([, v]) => v !== ''));
    const path = reschedule
      ? `/leads/${id}/follow-ups/${reschedule.id}`
      : `/leads/${id}/follow-ups`;
    if (
      await mutate(path, { method: reschedule ? 'PATCH' : 'POST', body: JSON.stringify(payload) })
    ) {
      setFollowOpen(false);
      setReschedule(undefined);
    }
  }
  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries([...form.entries()].filter(([, v]) => v !== ''));
    if (await mutate(`/leads/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }))
      setEditOpen(false);
  }
  async function archive() {
    if (await mutate(`/leads/${id}`, { method: 'DELETE' })) router.push('/app/leads');
  }
  if (!lead && !error) return <LoadingState label="Loading lead" />;
  if (!lead)
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
  const stages = pipelines.find((p) => p.id === lead.pipelineId)?.stages ?? [];
  const canUpdate = current.permissions.includes('lead.update');
  const canActivity = current.permissions.includes('activity.create');
  return (
    <div className="crm-page crm-record-page">
      <Link className="crm-back" href="/app/leads">
        <ArrowLeft size={14} />
        Leads
      </Link>
      <PageHeader
        title={lead.title}
        description={
          lead.company?.name || [lead.firstName, lead.lastName].filter(Boolean).join(' ') || 'Lead'
        }
        actions={
          !lead.archivedAt ? (
            <div className="record-actions">
              {lead.stage.isWon &&
              lead.companyId &&
              !lead.project &&
              current.permissions.includes('project.create') ? (
                <ProjectCreateSheet
                  initial={{
                    companyId: lead.companyId,
                    currency: lead.currency,
                    name: lead.title,
                    projectValue: lead.estimatedValue,
                    sourceLeadId: lead.id,
                  }}
                  onCreated={(project) => router.push(`/app/projects/${project.id}`)}
                  onOpenChange={setProjectOpen}
                  open={projectOpen}
                  trigger={
                    <Button>
                      <Plus size={15} /> Create project
                    </Button>
                  }
                />
              ) : null}
              {canUpdate ? (
                <Sheet
                  open={editOpen}
                  onOpenChange={setEditOpen}
                  title="Edit lead"
                  footer={
                    <>
                      <Button
                        disabled={busy}
                        onClick={() => setEditOpen(false)}
                        type="button"
                        variant="secondary"
                      >
                        Cancel
                      </Button>
                      <Button form={EDIT_LEAD_FORM_ID} loading={busy} type="submit">
                        Save changes
                      </Button>
                    </>
                  }
                  trigger={<Button variant="outline">Edit</Button>}
                >
                  <form
                    className="dialog-form"
                    id={EDIT_LEAD_FORM_ID}
                    onSubmit={(event) => void submitEdit(event)}
                  >
                    <label>
                      <span>Lead title</span>
                      <Input name="title" defaultValue={lead.title} required />
                    </label>
                    <div className="form-two-columns">
                      <label>
                        <span>First name</span>
                        <Input name="firstName" defaultValue={lead.firstName ?? ''} />
                      </label>
                      <label>
                        <span>Last name</span>
                        <Input name="lastName" defaultValue={lead.lastName ?? ''} />
                      </label>
                    </div>
                    <Select
                      label="Company"
                      name="companyId"
                      defaultValue={lead.companyId ?? undefined}
                      options={companies.map((c) => ({ label: c.name, value: c.id }))}
                      placeholder="No company"
                    />
                    <Select
                      label="Contact"
                      name="contactId"
                      defaultValue={lead.contactId ?? undefined}
                      options={contacts.map((c) => ({
                        label: `${c.firstName} ${c.lastName}`,
                        value: c.id,
                      }))}
                      placeholder="No contact"
                    />
                    <div className="form-two-columns">
                      <label>
                        <span>Email</span>
                        <Input name="email" type="email" defaultValue={lead.email ?? ''} />
                      </label>
                      <label>
                        <span>Phone</span>
                        <Input name="phone" defaultValue={lead.phone ?? ''} />
                      </label>
                    </div>
                    <div className="form-two-columns">
                      <Select
                        label="Source"
                        name="source"
                        defaultValue={lead.source ?? undefined}
                        options={leadSources.map((s) => ({ label: labelize(s), value: s }))}
                      />
                      <Select
                        label="Priority"
                        name="priority"
                        defaultValue={lead.priority}
                        options={leadPriorities.map((p) => ({ label: labelize(p), value: p }))}
                      />
                    </div>
                    <div className="form-two-columns">
                      <label>
                        <span>Estimated value</span>
                        <Input
                          name="estimatedValue"
                          type="number"
                          step="0.01"
                          defaultValue={lead.estimatedValue ?? ''}
                        />
                      </label>
                      <label>
                        <span>Currency</span>
                        <Input name="currency" maxLength={3} defaultValue={lead.currency} />
                      </label>
                    </div>
                    <label>
                      <span>Description</span>
                      <Textarea name="description" defaultValue={lead.description ?? ''} />
                    </label>
                    <label>
                      <span>Notes</span>
                      <Textarea name="notes" defaultValue={lead.notes ?? ''} />
                    </label>
                  </form>
                </Sheet>
              ) : null}
              {current.permissions.includes('lead.delete') ? (
                <ConfirmationDialog
                  title="Archive lead"
                  description="The lead will leave active views while its CRM activity and follow-up history remain preserved."
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
              {canActivity ? (
                <Dialog
                  open={activityOpen}
                  onOpenChange={setActivityOpen}
                  title="Add activity"
                  trigger={
                    <Button>
                      <Plus size={15} />
                      Add activity
                    </Button>
                  }
                >
                  <form className="dialog-form" onSubmit={(event) => void submitActivity(event)}>
                    <Select
                      label="Activity type"
                      name="type"
                      defaultValue="NOTE"
                      options={[
                        { label: 'Note', value: 'NOTE' },
                        { label: 'Call', value: 'CALL' },
                        { label: 'Meeting', value: 'MEETING' },
                        { label: 'Email', value: 'EMAIL' },
                      ]}
                    />
                    <label>
                      <span>Title</span>
                      <Input name="title" required />
                    </label>
                    <label>
                      <span>Details</span>
                      <Textarea name="description" />
                    </label>
                    <div className="ui-dialog-actions">
                      <Button loading={busy} type="submit">
                        Add activity
                      </Button>
                    </div>
                  </form>
                </Dialog>
              ) : null}
            </div>
          ) : undefined
        }
      />
      {error ? <AuthMessage>{error}</AuthMessage> : null}
      <div className="lead-command-bar">
        <div>
          <span>Stage</span>
          {!lead.archivedAt && current.permissions.includes('lead.stage.update') ? (
            <Select
              value={lead.stageId}
              onValueChange={(v) => void changeStage(v)}
              options={stages.map((s) => ({ label: s.name, value: s.id }))}
            />
          ) : (
            <Badge tone={lead.stage.isWon ? 'success' : lead.stage.isLost ? 'danger' : 'primary'}>
              {lead.stage.name}
            </Badge>
          )}
        </div>
        <div>
          <span>Owner</span>
          {!lead.archivedAt && current.permissions.includes('lead.assign') && users.length ? (
            <Select
              value={lead.ownerId ?? '__unassigned__'}
              onValueChange={(v) =>
                void mutate(`/leads/${id}/owner`, {
                  method: 'PATCH',
                  body: JSON.stringify({ ownerId: v === '__unassigned__' ? null : v }),
                })
              }
              options={[
                { label: 'Unassigned', value: '__unassigned__' },
                ...users.map((u) => ({ label: personName(u), value: u.id })),
              ]}
              placeholder="Unassigned"
            />
          ) : (
            <strong>{personName(lead.owner)}</strong>
          )}
        </div>
        {!lead.archivedAt && canActivity ? (
          <Button
            variant="outline"
            onClick={() => {
              setReschedule(undefined);
              setFollowOpen(true);
            }}
          >
            <CalendarClock size={15} />
            Schedule follow-up
          </Button>
        ) : null}
      </div>
      <div className="record-grid">
        <section className="record-section">
          <h2>Overview</h2>
          <dl className="detail-list">
            {lead.project ? (
              <Detail
                label="Project"
                value={
                  <Link href={`/app/projects/${lead.project.id}`}>
                    {lead.project.name} · {labelize(lead.project.status)}
                  </Link>
                }
              />
            ) : null}
            <Detail label="Value" value={formatMoney(lead.estimatedValue, lead.currency)} />
            <Detail label="Source" value={lead.source ? labelize(lead.source) : '-'} />
            <Detail
              label="Priority"
              value={
                <Badge
                  tone={
                    lead.priority === 'URGENT'
                      ? 'danger'
                      : lead.priority === 'HIGH'
                        ? 'warning'
                        : 'neutral'
                  }
                >
                  {labelize(lead.priority)}
                </Badge>
              }
            />
            <Detail
              label="Next follow-up"
              value={
                lead.nextFollowUpAt
                  ? new Date(lead.nextFollowUpAt).toLocaleString()
                  : 'Not scheduled'
              }
            />
            <Detail
              label="Email"
              value={
                lead.email ? (
                  <a href={`mailto:${lead.email}`}>{lead.email}</a>
                ) : (
                  lead.contact?.email || '-'
                )
              }
            />
            <Detail label="Phone" value={lead.phone || lead.contact?.phone || '-'} />
            <Detail label="Description" value={lead.description || '-'} />
            <Detail label="Notes" value={lead.notes || '-'} />
            {lead.lostReason ? <Detail label="Lost reason" value={lead.lostReason} /> : null}
          </dl>
        </section>
        <section className="record-section">
          <div className="section-heading">
            <h2>Follow-ups</h2>
            <span>{lead.followUps?.filter((f) => f.status === 'PENDING').length ?? 0} pending</span>
          </div>
          {lead.followUps?.length ? (
            <div className="follow-up-list">
              {lead.followUps.map((f) => (
                <div className="follow-up-item" key={f.id}>
                  <div>
                    <Badge
                      tone={
                        f.status === 'PENDING'
                          ? new Date(f.dueAt) < new Date()
                            ? 'danger'
                            : 'warning'
                          : 'neutral'
                      }
                    >
                      {labelize(f.status)}
                    </Badge>
                    <strong>
                      {labelize(f.type)} · {new Date(f.dueAt).toLocaleString()}
                    </strong>
                    <p>{f.notes || `Assigned to ${personName(f.assignedTo)}`}</p>
                  </div>
                  {!lead.archivedAt && f.status === 'PENDING' && canActivity ? (
                    <div className="follow-actions">
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setReschedule(f);
                          setFollowOpen(true);
                        }}
                      >
                        Reschedule
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          void mutate(`/leads/${id}/follow-ups/${f.id}/complete`, {
                            method: 'POST',
                          })
                        }
                      >
                        <Check size={14} />
                        Complete
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          void mutate(`/leads/${id}/follow-ups/${f.id}/cancel`, { method: 'POST' })
                        }
                      >
                        <X size={14} />
                        Cancel
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="record-empty">No follow-ups scheduled.</p>
          )}
        </section>
        <section className="record-section record-section--wide">
          <h2>Activity timeline</h2>
          {lead.activities?.length ? (
            <div className="activity-list">
              {lead.activities.map((activity) => (
                <div className="activity-item" key={activity.id}>
                  <span className="activity-icon">
                    {activity.type === 'CALL' ? (
                      <Phone size={14} />
                    ) : activity.type === 'MEETING' ? (
                      <Users size={14} />
                    ) : activity.type === 'EMAIL' ? (
                      <Mail size={14} />
                    ) : (
                      <MessageSquare size={14} />
                    )}
                  </span>
                  <div>
                    <strong>{activity.title}</strong>
                    {activity.description ? <p>{activity.description}</p> : null}
                    <small>
                      {activity.createdBy ? personName(activity.createdBy) : 'System'} ·{' '}
                      {new Date(activity.occurredAt).toLocaleString()}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="record-empty">No activity recorded.</p>
          )}
        </section>
      </div>
      <Dialog
        open={followOpen}
        onOpenChange={(open) => {
          setFollowOpen(open);
          if (!open) setReschedule(undefined);
        }}
        title={reschedule ? 'Reschedule follow-up' : 'Schedule follow-up'}
        trigger={
          <button aria-hidden className="visually-hidden" tabIndex={-1} type="button">
            Open follow-up dialog
          </button>
        }
      >
        <form
          className="dialog-form"
          key={reschedule?.id ?? 'new-follow-up'}
          onSubmit={(event) => void submitFollow(event)}
        >
          <label>
            <span>Due date and time</span>
            <Input
              name="dueAt"
              type="datetime-local"
              required
              defaultValue={reschedule ? toLocalInput(reschedule.dueAt) : ''}
            />
          </label>
          {!reschedule ? (
            <Select
              label="Type"
              name="type"
              defaultValue="CALL"
              options={[
                { label: 'Call', value: 'CALL' },
                { label: 'Meeting', value: 'MEETING' },
                { label: 'Email', value: 'EMAIL' },
                { label: 'Other', value: 'OTHER' },
              ]}
            />
          ) : null}
          {users.length ? (
            <Select
              label="Assigned to"
              name="assignedToId"
              defaultValue={reschedule?.assignedTo?.id ?? lead.ownerId ?? current.id}
              options={users.map((u) => ({ label: personName(u), value: u.id }))}
            />
          ) : null}
          <label>
            <span>Notes</span>
            <Textarea name="notes" defaultValue={reschedule?.notes ?? ''} />
          </label>
          <div className="ui-dialog-actions">
            <Button loading={busy} type="submit">
              {reschedule ? 'Reschedule' : 'Schedule'}
            </Button>
          </div>
        </form>
      </Dialog>
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
function toLocalInput(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
