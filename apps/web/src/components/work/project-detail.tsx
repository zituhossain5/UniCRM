'use client';

import { AuthMessage } from '@/components/auth-screen';
import {
  AdditionalInformationFields,
  configurableRecordPayload,
  RecordMetadataSummary,
  useRecordConfiguration,
} from '@/components/configuration/record-configuration';
import { useCurrentUser } from '@/components/auth-provider';
import { apiBaseUrl, apiRequest } from '@/lib/api';
import { emitCrmDataChanged } from '@/lib/crm-events';
import { formatMoney, labelize, personName } from '@/lib/crm-types';
import { useWorkReferenceData } from '@/lib/work-reference-data';
import {
  formatDateOnly,
  projectStatuses,
  workPriorities,
  type AttachmentRecord,
  type ListResponse,
  type ProjectRecord,
  type TaskRecord,
  type WorkActivity,
} from '@/lib/work-types';
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
import { ArrowLeft, Download, Paperclip, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { TaskCreateSheet } from './create-sheets';
import { TaskQuickView } from './task-quick-view';

const tabs = ['overview', 'tasks', 'team', 'financials', 'activity', 'files'] as const;
type ProjectTab = (typeof tabs)[number];

export function ProjectDetail({ id }: { id: string }) {
  const current = useCurrentUser();
  const router = useRouter();
  const references = useWorkReferenceData();
  const editFormId = `edit-project-${useId().replaceAll(':', '')}`;
  const [project, setProject] = useState<ProjectRecord>();
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [files, setFiles] = useState<AttachmentRecord[]>([]);
  const [tab, setTab] = useState<ProjectTab>('overview');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const configuration = useRecordConfiguration('PROJECT');
  const load = useCallback(async () => {
    try {
      setError('');
      const [projectResult, taskResult, fileResult] = await Promise.all([
        apiRequest<{ data: ProjectRecord }>(`/projects/${id}`),
        apiRequest<ListResponse<TaskRecord>>(`/projects/${id}/tasks?limit=100`),
        current.permissions.includes('attachment.read')
          ? apiRequest<{ data: AttachmentRecord[] }>(`/projects/${id}/attachments`)
          : Promise.resolve({ data: [] }),
      ]);
      setProject(projectResult.data);
      setTasks(taskResult.data);
      setFiles(fileResult.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load project.');
    }
  }, [current.permissions, id]);
  useEffect(() => {
    void load();
  }, [load]);

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const form = event.currentTarget;
      const data = configurableRecordPayload(form, configuration.definitions, {
        includeEmptyValues: true,
      }) as Record<string, unknown>;
      if (typeof data.progress === 'string') data.progress = Number(data.progress);
      for (const key of [
        'projectManagerId',
        'startDate',
        'deadline',
        'projectValue',
        'description',
      ])
        if (data[key] === '') data[key] = null;
      await apiRequest(`/projects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      emitCrmDataChanged(['projects']);
      setEditOpen(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Project update failed.');
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    setBusy(true);
    try {
      await apiRequest(`/projects/${id}`, { method: 'DELETE' });
      emitCrmDataChanged(['projects']);
      router.push('/app/projects');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not archive project.');
      setBusy(false);
    }
  }

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setError('');
    try {
      const data = Object.fromEntries(
        [...new FormData(form).entries()].filter(([, value]) => value !== ''),
      );
      await apiRequest(`/projects/${id}/members`, { method: 'POST', body: JSON.stringify(data) });
      form.reset();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add member.');
    } finally {
      setBusy(false);
    }
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setError('');
    try {
      await apiRequest(`/projects/${id}/attachments`, {
        method: 'POST',
        body: new FormData(form),
      });
      form.reset();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  if (!project && !error) return <LoadingState label="Loading project" />;
  if (!project)
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
    <div className="crm-page crm-record-page project-record-page">
      <Link className="crm-back" href="/app/projects">
        <ArrowLeft size={14} /> Projects
      </Link>
      <PageHeader
        description={project.company.name}
        title={project.name}
        actions={
          !project.archivedAt ? (
            <div className="record-actions">
              {current.permissions.includes('project.update') ? (
                <Sheet
                  footer={
                    <>
                      <Button
                        disabled={busy}
                        onClick={() => setEditOpen(false)}
                        variant="secondary"
                      >
                        Cancel
                      </Button>
                      <Button form={editFormId} loading={busy} type="submit">
                        Save changes
                      </Button>
                    </>
                  }
                  onOpenChange={setEditOpen}
                  open={editOpen}
                  title="Edit project"
                  trigger={<Button variant="outline">Edit</Button>}
                >
                  <form
                    className="dialog-form"
                    id={editFormId}
                    onSubmit={(event) => void submitEdit(event)}
                  >
                    <label>
                      <span>Project name</span>
                      <Input defaultValue={project.name} name="name" required />
                    </label>
                    <Select
                      defaultValue={project.companyId}
                      label="Client"
                      name="companyId"
                      options={references.companies.map((company) => ({
                        label: company.name,
                        value: company.id,
                      }))}
                    />
                    <Select
                      defaultValue={project.projectManagerId ?? undefined}
                      label="Project manager"
                      name="projectManagerId"
                      options={[
                        { label: 'Unassigned', value: '' },
                        ...references.users.map((user) => ({
                          label: personName(user),
                          value: user.id,
                        })),
                      ]}
                    />
                    <div className="form-two-columns">
                      <Select
                        defaultValue={project.status}
                        label="Status"
                        name="status"
                        options={projectStatuses.map((value) => ({
                          label: labelize(value),
                          value,
                        }))}
                      />
                      <Select
                        defaultValue={project.priority}
                        label="Priority"
                        name="priority"
                        options={workPriorities.map((value) => ({ label: labelize(value), value }))}
                      />
                    </div>
                    <div className="form-two-columns">
                      <label>
                        <span>Start date</span>
                        <Input
                          defaultValue={project.startDate?.slice(0, 10) ?? ''}
                          name="startDate"
                          type="date"
                        />
                      </label>
                      <label>
                        <span>Deadline</span>
                        <Input
                          defaultValue={project.deadline?.slice(0, 10) ?? ''}
                          name="deadline"
                          type="date"
                        />
                      </label>
                    </div>
                    <label>
                      <span>Progress</span>
                      <Input
                        defaultValue={project.progress}
                        max="100"
                        min="0"
                        name="progress"
                        type="number"
                      />
                    </label>
                    <div className="form-two-columns">
                      <label>
                        <span>Project value</span>
                        <Input
                          defaultValue={project.projectValue ?? ''}
                          min="0"
                          name="projectValue"
                          step="0.01"
                          type="number"
                        />
                      </label>
                      <label>
                        <span>Currency</span>
                        <Input
                          defaultValue={project.currency}
                          maxLength={3}
                          name="currency"
                          required
                        />
                      </label>
                    </div>
                    <label>
                      <span>Description</span>
                      <Textarea defaultValue={project.description ?? ''} name="description" />
                    </label>
                    <AdditionalInformationFields
                      definitions={configuration.definitions}
                      entries={project.customFields}
                      selectedTags={project.tags}
                      tags={configuration.tags}
                    />
                  </form>
                </Sheet>
              ) : null}
              {current.permissions.includes('project.delete') ? (
                <ConfirmationDialog
                  confirmLabel="Archive"
                  description="The project and its history will remain stored but leave active lists."
                  onConfirm={() => void archive()}
                  title="Archive project?"
                  trigger={
                    <Button variant="ghost">
                      <Trash2 size={14} /> Archive
                    </Button>
                  }
                />
              ) : null}
            </div>
          ) : undefined
        }
      />
      {error ? <AuthMessage>{error}</AuthMessage> : null}
      <div className="crm-view-tabs project-tabs" role="tablist">
        {tabs.map((value) => (
          <button
            aria-selected={tab === value}
            key={value}
            onClick={() => setTab(value)}
            role="tab"
            type="button"
          >
            {labelize(value)}
          </button>
        ))}
      </div>
      {tab === 'overview' ? (
        <div className="record-grid">
          <section className="record-section">
            <h2>Project</h2>
            <dl className="detail-list">
              <div>
                <dt>Status</dt>
                <dd>
                  <Badge tone={project.status === 'COMPLETED' ? 'success' : 'neutral'}>
                    {labelize(project.status)}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt>Client</dt>
                <dd>
                  <Link href={`/app/companies/${project.company.id}`}>{project.company.name}</Link>
                </dd>
              </div>
              <div>
                <dt>Manager</dt>
                <dd>{personName(project.projectManager)}</dd>
              </div>
              <div>
                <dt>Priority</dt>
                <dd>{labelize(project.priority)}</dd>
              </div>
              <div>
                <dt>Team</dt>
                <dd>{project._count.members} members</dd>
              </div>
            </dl>
          </section>
          <RecordMetadataSummary entries={project.customFields} tags={project.tags} />
          <section className="record-section">
            <h2>Schedule & value</h2>
            <dl className="detail-list">
              <div>
                <dt>Start date</dt>
                <dd>{formatDateOnly(project.startDate)}</dd>
              </div>
              <div>
                <dt>Deadline</dt>
                <dd>{formatDateOnly(project.deadline)}</dd>
              </div>
              <div>
                <dt>Progress</dt>
                <dd>{project.progress}%</dd>
              </div>
              <div>
                <dt>Project value</dt>
                <dd>{formatMoney(project.projectValue, project.currency)}</dd>
              </div>
              {project.sourceLead ? (
                <div>
                  <dt>Source lead</dt>
                  <dd>
                    <Link href={`/app/leads/${project.sourceLead.id}`}>
                      {project.sourceLead.title}
                    </Link>
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>
          <section className="record-section record-section--wide">
            <h2>Description</h2>
            <p className="record-copy">{project.description || 'No description provided.'}</p>
          </section>
        </div>
      ) : null}
      {tab === 'tasks' ? (
        <section className="project-panel">
          <div className="section-heading">
            <h2>Tasks</h2>
            {current.permissions.includes('task.create') ? (
              <TaskCreateSheet
                initialProjectId={id}
                onCreated={load}
                onOpenChange={setTaskOpen}
                open={taskOpen}
                trigger={
                  <Button>
                    <Plus size={14} /> Add task
                  </Button>
                }
              />
            ) : null}
          </div>
          {tasks.length ? (
            <div className="crm-table-wrap">
              <table className="crm-table tasks-table">
                <thead>
                  <tr>
                    <th>Task</th>
                    <th>Status</th>
                    <th>Priority</th>
                    <th>Assignee</th>
                    <th>Due date</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => (
                    <tr key={task.id}>
                      <td>
                        <button
                          className="crm-record-button"
                          onClick={() => setSelectedTask(task.id)}
                          type="button"
                        >
                          <strong>{task.title}</strong>
                        </button>
                      </td>
                      <td>
                        <Badge
                          tone={
                            task.status === 'COMPLETED'
                              ? 'success'
                              : task.status === 'BLOCKED'
                                ? 'danger'
                                : 'neutral'
                          }
                        >
                          {labelize(task.status)}
                        </Badge>
                      </td>
                      <td>{labelize(task.priority)}</td>
                      <td>{personName(task.assignee)}</td>
                      <td>{formatDateOnly(task.dueDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="record-empty">No tasks in this project.</p>
          )}
        </section>
      ) : null}
      {tab === 'team' ? (
        <section className="project-panel">
          <h2>Team</h2>
          {current.permissions.includes('project.manage_members') ? (
            <form className="member-form" onSubmit={(event) => void addMember(event)}>
              <Select
                label="Team member"
                name="userId"
                options={references.users
                  .filter((user) => !project.members?.some((member) => member.user.id === user.id))
                  .map((user) => ({ label: personName(user), value: user.id }))}
                placeholder="Choose a user"
              />
              <label>
                <span>Project role</span>
                <Input maxLength={80} name="role" placeholder="Developer, Designer, QA..." />
              </label>
              <Button loading={busy} type="submit">
                <Plus size={14} /> Add
              </Button>
            </form>
          ) : null}
          <div className="member-list">
            {project.members?.map((member) => (
              <div key={member.id}>
                <span>
                  <strong>{personName(member.user)}</strong>
                  <small>{member.role || 'Contributor'}</small>
                </span>
                {current.permissions.includes('project.manage_members') ? (
                  <Button
                    aria-label={`Remove ${personName(member.user)}`}
                    onClick={() =>
                      void apiRequest(`/projects/${id}/members/${member.user.id}`, {
                        method: 'DELETE',
                      }).then(load)
                    }
                    variant="ghost"
                  >
                    <Trash2 size={14} />
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {tab === 'financials' ? (
        <section className="project-panel">
          <div className="section-heading">
            <h2>Financials</h2>
            <div className="page-action-row">
              {current.permissions.includes('quotation.create') ? (
                <Link
                  className="ui-button ui-button--secondary"
                  href={`/app/quotations/new?companyId=${project.companyId}&projectId=${project.id}&currency=${project.currency}`}
                >
                  New quotation
                </Link>
              ) : null}
              {current.permissions.includes('payment.create') ? (
                <Link
                  className="ui-button ui-button--primary"
                  href={`/app/payments?record=1&companyId=${project.companyId}&projectId=${project.id}`}
                >
                  Record payment
                </Link>
              ) : null}
            </div>
          </div>
          <div className="financial-summary">
            <div>
              <span>Project value</span>
              <strong>
                {formatMoney(
                  project.financials?.projectValue ?? project.projectValue,
                  project.currency,
                )}
              </strong>
            </div>
            <div>
              <span>Quoted amount</span>
              <strong>
                {formatMoney(project.financials?.quotedAmount ?? '0', project.currency)}
              </strong>
            </div>
            <div>
              <span>Received</span>
              <strong>{formatMoney(project.financials?.received ?? '0', project.currency)}</strong>
            </div>
            <div>
              <span>
                {Number(project.financials?.outstanding ?? 0) < 0 ? 'Overpaid' : 'Outstanding'}
              </span>
              <strong>
                {formatMoney(
                  String(Math.abs(Number(project.financials?.outstanding ?? 0))),
                  project.currency,
                )}
              </strong>
            </div>
          </div>
          <h2>Quotations</h2>
          {project.quotations?.length ? (
            <div className="crm-table-wrap">
              <table className="crm-table">
                <thead>
                  <tr>
                    <th>Quotation</th>
                    <th>Status</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {project.quotations.map((quotation) => (
                    <tr key={quotation.id}>
                      <td>
                        <Link href={`/app/quotations/${quotation.id}`}>
                          {quotation.quotationNumber}
                        </Link>
                      </td>
                      <td>
                        <Badge>{labelize(quotation.status)}</Badge>
                      </td>
                      <td>{formatMoney(quotation.total, quotation.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="record-empty">No linked quotations.</p>
          )}
          <h2 className="financial-subheading">Payments</h2>
          {project.payments?.length ? (
            <div className="crm-table-wrap">
              <table className="crm-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Method</th>
                    <th>Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {project.payments.map((payment) => (
                    <tr key={payment.id}>
                      <td>{formatDateOnly(payment.paymentDate)}</td>
                      <td>{formatMoney(payment.amount, payment.currency)}</td>
                      <td>{payment.method ? labelize(payment.method) : '-'}</td>
                      <td>{payment.reference ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="record-empty">No linked payments.</p>
          )}
        </section>
      ) : null}
      {tab === 'activity' ? (
        <section className="project-panel">
          <h2>Activity</h2>
          <div className="activity-list">
            {project.activity?.length ? (
              project.activity.map((item) => (
                <div className="activity-item" key={item.id}>
                  <span className="activity-dot" />
                  <div>
                    <strong>{activityLabel(item)}</strong>
                    <p>{personName(item.actor)}</p>
                    {activityDescription(item) ? <p>{activityDescription(item)}</p> : null}
                    <small>{new Date(item.createdAt).toLocaleString()}</small>
                  </div>
                </div>
              ))
            ) : (
              <p className="record-empty">No project activity yet.</p>
            )}
          </div>
        </section>
      ) : null}
      {tab === 'files' ? (
        <section className="project-panel">
          <h2>Files</h2>
          {current.permissions.includes('attachment.create') ? (
            <form className="upload-form" onSubmit={(event) => void upload(event)}>
              <Input
                accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,.docx"
                name="file"
                required
                type="file"
              />
              <Button loading={busy} type="submit">
                Upload
              </Button>
            </form>
          ) : null}
          <div className="file-list">
            {files.length ? (
              files.map((file) => (
                <div key={file.id}>
                  <Paperclip size={14} />
                  <span>
                    <strong>{file.fileName}</strong>
                    <small>
                      {formatSize(file.size)} · {personName(file.uploadedBy)} ·{' '}
                      {new Date(file.createdAt).toLocaleDateString()}
                    </small>
                  </span>
                  <a
                    aria-label={`Download ${file.fileName}`}
                    href={`${apiBaseUrl()}/attachments/${file.id}/download`}
                  >
                    <Download size={14} />
                  </a>
                  {current.permissions.includes('attachment.delete') ? (
                    <button
                      aria-label={`Delete ${file.fileName}`}
                      onClick={() =>
                        void apiRequest(`/attachments/${file.id}`, { method: 'DELETE' }).then(load)
                      }
                      type="button"
                    >
                      <Trash2 size={14} />
                    </button>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="record-empty">No files uploaded.</p>
            )}
          </div>
        </section>
      ) : null}
      <TaskQuickView
        onChanged={load}
        onOpenChange={(open) => !open && setSelectedTask(null)}
        open={Boolean(selectedTask)}
        taskId={selectedTask}
      />
    </div>
  );
}

const activityLabels: Record<string, string> = {
  PROJECT_CREATED: 'Project created',
  PROJECT_UPDATED: 'Project updated',
  PROJECT_MEMBER_ADDED: 'Team member added',
  PROJECT_MEMBER_REMOVED: 'Team member removed',
  PROJECT_TASK_CREATED: 'Task created',
  PROJECT_TASK_COMPLETED: 'Task completed',
  PROJECT_ARCHIVED: 'Project archived',
};
function activityLabel(item: WorkActivity) {
  if (item.action === 'PROJECT_UPDATED') {
    if (item.metadata?.status) return 'Status changed';
    if (item.metadata?.projectManagerId) return 'Project manager changed';
    if (item.metadata?.deadline) return 'Deadline changed';
  }
  return activityLabels[item.action] ?? labelize(item.action);
}
function activityDescription(item: WorkActivity) {
  const metadata = item.metadata;
  if (!metadata) return '';
  const status = metadata.status as { from?: string; to?: string } | undefined;
  if (status?.from && status.to) return `${labelize(status.from)} to ${labelize(status.to)}`;
  if (typeof metadata.title === 'string') return metadata.title;
  if (typeof metadata.role === 'string') return metadata.role;
  const deadline = metadata.deadline as { from?: string | null; to?: string | null } | undefined;
  if (deadline) return `${formatDateOnly(deadline.from)} to ${formatDateOnly(deadline.to)}`;
  return '';
}
function formatSize(bytes: number) {
  return bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${Math.round(bytes / 1024)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
