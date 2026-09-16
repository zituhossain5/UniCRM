'use client';

import { useCurrentUser } from '@/components/auth-provider';
import { apiBaseUrl, apiRequest } from '@/lib/api';
import {
  caseLabel,
  casePriorities,
  caseStatuses,
  caseTypes,
  type CustomerCase,
} from '@/lib/case-types';
import { useCrmReferenceData, userOptions } from '@/lib/crm-reference-data';
import { Badge, Button, ErrorState, Input, LoadingState, Select, Textarea } from '@unicrm/ui';
import {
  Archive,
  ArrowLeft,
  Download,
  ExternalLink,
  FileText,
  History,
  ListTodo,
  MessageSquarePlus,
  Paperclip,
  Plus,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

type DetailTab = 'overview' | 'activity' | 'tasks' | 'attachments';

export function CaseDetail({ id }: { id: string }) {
  const current = useCurrentUser();
  const router = useRouter();
  const { users } = useCrmReferenceData({ users: current.permissions.includes('user.read') });
  const [record, setRecord] = useState<CustomerCase>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<DetailTab>('overview');
  const [commentOpen, setCommentOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setError('');
      setRecord((await apiRequest<{ data: CustomerCase }>(`/cases/${id}`)).data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load case.');
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  async function update(payload: Record<string, unknown>) {
    setBusy(true);
    setError('');
    try {
      const updated = await apiRequest<{ data: CustomerCase }>(`/cases/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      setRecord(updated.data);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update case.');
    } finally {
      setBusy(false);
    }
  }
  async function submitForm(event: FormEvent<HTMLFormElement>, path: string) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setError('');
    try {
      const payload = Object.fromEntries(
        [...new FormData(form).entries()].filter(([, value]) => value !== ''),
      );
      await apiRequest(path, { method: 'POST', body: JSON.stringify(payload) });
      form.reset();
      setCommentOpen(false);
      setTaskOpen(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The request could not be completed.');
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
      await apiRequest(`/cases/${id}/attachments`, { method: 'POST', body: new FormData(form) });
      form.reset();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  if (error && !record)
    return (
      <ErrorState
        title="Case unavailable"
        description={error}
        action={<Button onClick={() => void load()}>Retry</Button>}
      />
    );
  if (!record) return <LoadingState label="Loading case" />;
  const canUpdate = current.permissions.includes('case.update');
  const tabs: Array<{ value: DetailTab; label: string; count?: number }> = [
    { value: 'overview', label: 'Overview' },
    { value: 'activity', label: 'Activity', count: record.activity?.length ?? 0 },
    { value: 'tasks', label: 'Tasks', count: record.tasks?.length ?? 0 },
    { value: 'attachments', label: 'Attachments', count: record.attachments?.length ?? 0 },
  ];

  return (
    <div className="crm-page crm-record-page case-detail-page">
      <Link className="crm-back" href="/app/cases">
        <ArrowLeft size={14} /> Cases
      </Link>
      <header className="case-record-header">
        <div>
          <span className="case-record-number">{record.caseNumber}</span>
          <h1>{record.title}</h1>
          <p>{caseLabel(record.type)}</p>
          <div className="case-record-badges">
            <Badge tone={statusTone(record.status)}>{caseLabel(record.status)}</Badge>
            <Badge tone={priorityTone(record.priority)}>{caseLabel(record.priority)}</Badge>
          </div>
        </div>
        {current.permissions.includes('case.delete') ? (
          <Button
            variant="outline"
            onClick={() => {
              if (window.confirm(`Archive ${record.caseNumber}?`))
                void apiRequest(`/cases/${id}`, { method: 'DELETE' })
                  .then(() => router.push('/app/cases'))
                  .catch((cause) =>
                    setError(cause instanceof Error ? cause.message : 'Could not archive case.'),
                  );
            }}
          >
            <Archive size={14} /> Archive
          </Button>
        ) : null}
      </header>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <nav
        className="crm-view-tabs project-tabs case-detail-tabs"
        aria-label="Case sections"
        role="tablist"
      >
        {tabs.map((item) => (
          <button
            aria-selected={tab === item.value}
            key={item.value}
            onClick={() => setTab(item.value)}
            role="tab"
            type="button"
          >
            {item.label}
            {item.count !== undefined ? ` (${item.count})` : ''}
          </button>
        ))}
      </nav>

      {tab === 'overview' ? (
        <div className="case-overview-grid">
          <section className="record-section case-details-panel">
            <div className="section-heading">
              <h2>Case details</h2>
            </div>
            <dl className="case-detail-fields">
              <div>
                <dt>Status</dt>
                <dd>
                  <Select
                    aria-label="Case status"
                    disabled={!canUpdate || busy}
                    value={record.status}
                    onValueChange={(value) => value && void update({ status: value })}
                    options={caseStatuses.map((value) => ({ value, label: caseLabel(value) }))}
                  />
                </dd>
              </div>
              <div>
                <dt>Assignee</dt>
                <dd>
                  <Select
                    aria-label="Case assignee"
                    disabled={!current.permissions.includes('case.assign') || busy}
                    value={record.assignedUserId ?? ''}
                    onValueChange={(value) => void update({ assignedUserId: value || null })}
                    options={[{ value: '', label: 'Unassigned' }, ...userOptions(users)]}
                  />
                </dd>
              </div>
              <div>
                <dt>Priority</dt>
                <dd>
                  <Select
                    aria-label="Case priority"
                    disabled={!canUpdate || busy}
                    value={record.priority}
                    onValueChange={(value) => value && void update({ priority: value })}
                    options={casePriorities.map((value) => ({ value, label: caseLabel(value) }))}
                  />
                </dd>
              </div>
              <div>
                <dt>Due</dt>
                <dd>
                  <Input
                    aria-label="Case due date"
                    disabled={!canUpdate || busy}
                    type="datetime-local"
                    key={record.dueAt ?? 'none'}
                    defaultValue={toLocalInput(record.dueAt)}
                    onBlur={(event) =>
                      void update({
                        dueAt: event.target.value
                          ? new Date(event.target.value).toISOString()
                          : null,
                      })
                    }
                  />
                </dd>
              </div>
              <div>
                <dt>Type</dt>
                <dd>
                  <Select
                    aria-label="Case type"
                    disabled={!canUpdate || busy}
                    value={record.type}
                    onValueChange={(value) => value && void update({ type: value })}
                    options={caseTypes.map((value) => ({ value, label: caseLabel(value) }))}
                  />
                </dd>
              </div>
              <div>
                <dt>Contact</dt>
                <dd>
                  {record.contact ? (
                    <Link href={`/app/contacts/${record.contact.id}`}>
                      {personName(record.contact)}
                    </Link>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
              <div>
                <dt>Company</dt>
                <dd>
                  {record.company ? (
                    <Link href={`/app/companies/${record.company.id}`}>{record.company.name}</Link>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
              <div>
                <dt>Deal</dt>
                <dd>
                  {record.deal ? (
                    <Link href={`/app/deals/${record.deal.id}`}>{record.deal.name}</Link>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
            </dl>
          </section>
          <section className="record-section case-context-panel">
            <h2>Description</h2>
            <p className="record-copy">{record.description || 'No description provided.'}</p>
            <div className="case-related-records">
              {record.lead ? (
                <Link href={`/app/leads/${record.lead.id}`}>Lead · {record.lead.title}</Link>
              ) : null}
              {record.sourceThread ? (
                <Link href={`/app/email?thread=${record.sourceThread.id}`}>
                  Related email · {record.sourceThread.subject} <ExternalLink size={13} />
                </Link>
              ) : null}
            </div>
          </section>
          <section className="record-section record-section--wide case-comments-panel">
            <div className="section-heading">
              <h2>Internal comments</h2>
              {current.permissions.includes('case.comment') ? (
                <Button variant="outline" onClick={() => setCommentOpen((value) => !value)}>
                  <MessageSquarePlus size={14} /> Add comment
                </Button>
              ) : null}
            </div>
            {commentOpen ? (
              <form
                className="case-compact-compose"
                onSubmit={(event) => void submitForm(event, `/cases/${id}/comments`)}
              >
                <Textarea
                  aria-label="Internal comment"
                  name="content"
                  placeholder="Add an internal comment..."
                  required
                  rows={2}
                />
                <div>
                  <Button type="button" variant="ghost" onClick={() => setCommentOpen(false)}>
                    Cancel
                  </Button>
                  <Button disabled={busy} loading={busy} type="submit">
                    Add comment
                  </Button>
                </div>
              </form>
            ) : null}
            {record.comments?.length ? (
              <div className="comment-list case-comment-list">
                {record.comments.map((comment) => (
                  <article key={comment.id}>
                    <div>
                      <strong>{personName(comment.author)}</strong>
                      <small>{formatDateTime(comment.createdAt)}</small>
                    </div>
                    <p>{comment.content}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="record-empty">No internal comments yet.</p>
            )}
          </section>
        </div>
      ) : null}

      {tab === 'tasks' ? (
        <section className="project-panel case-tab-panel">
          <div className="section-heading">
            <h2>Tasks</h2>
            {current.permissions.includes('task.create') ? (
              <Button variant="outline" onClick={() => setTaskOpen((value) => !value)}>
                <Plus size={14} /> Create task
              </Button>
            ) : null}
          </div>
          {taskOpen ? (
            <form
              className="case-compact-compose case-task-compose"
              onSubmit={(event) => void submitForm(event, `/cases/${id}/tasks`)}
            >
              <Input aria-label="Task title" name="title" placeholder="Task title" required />
              <div>
                <Button type="button" variant="ghost" onClick={() => setTaskOpen(false)}>
                  Cancel
                </Button>
                <Button disabled={busy} loading={busy} type="submit">
                  Create task
                </Button>
              </div>
            </form>
          ) : null}
          {record.tasks?.length ? (
            <div className="case-task-list">
              {record.tasks.map((task) => (
                <article key={task.id}>
                  <span className="activity-icon">
                    <ListTodo size={14} />
                  </span>
                  <div>
                    <strong>{task.title}</strong>
                    <small>
                      {task.assignee ? personName(task.assignee) : 'Unassigned'} ·{' '}
                      {caseLabel(task.priority)}
                      {task.dueDate ? ` · Due ${formatDate(task.dueDate)}` : ''}
                    </small>
                  </div>
                  <Badge>{caseLabel(task.status)}</Badge>
                </article>
              ))}
            </div>
          ) : (
            <p className="record-empty">No tasks linked to this case.</p>
          )}
        </section>
      ) : null}

      {tab === 'attachments' ? (
        <section className="project-panel case-tab-panel">
          <div className="section-heading">
            <h2>Attachments</h2>
          </div>
          {current.permissions.includes('attachment.create') && canUpdate ? (
            <form className="upload-form" onSubmit={(event) => void upload(event)}>
              <Input
                aria-label="Choose attachment"
                accept=".pdf,.docx,.jpg,.jpeg,.png,.csv,.txt"
                name="file"
                type="file"
                required
              />
              <Button disabled={busy} loading={busy} type="submit">
                Upload file
              </Button>
            </form>
          ) : null}
          <div className="file-list">
            {record.attachments?.length ? (
              record.attachments.map((file) => (
                <div key={file.id}>
                  <Paperclip size={14} />
                  <span>
                    <strong>{file.fileName}</strong>
                    <small>
                      {formatSize(file.size)} · uploaded by {personName(file.uploadedBy)} ·{' '}
                      {formatDate(file.createdAt)}
                    </small>
                  </span>
                  <a
                    aria-label={`Download ${file.fileName}`}
                    href={`${apiBaseUrl()}/attachments/${file.id}/download`}
                  >
                    <Download size={14} />
                  </a>
                </div>
              ))
            ) : (
              <p className="record-empty">No files uploaded.</p>
            )}
          </div>
        </section>
      ) : null}

      {tab === 'activity' ? (
        <section className="project-panel case-tab-panel">
          <h2>Activity timeline</h2>
          {record.activity?.length ? (
            <div className="activity-list">
              {record.activity.map((item) => (
                <div className="activity-item" key={item.id}>
                  <span className="activity-icon">{activityIcon(item.action)}</span>
                  <div>
                    <strong>{activityTitle(item.action)}</strong>
                    {activityDescription(item.metadata) ? (
                      <p>{activityDescription(item.metadata)}</p>
                    ) : null}
                    <small>
                      {item.actor ? personName(item.actor) : 'System'} ·{' '}
                      {formatDateTime(item.createdAt)}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="record-empty">No Case activity recorded.</p>
          )}
        </section>
      ) : null}
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
function personName(person: { firstName: string; lastName: string }) {
  return `${person.firstName} ${person.lastName}`;
}
function formatDate(value: string) {
  return new Date(value).toLocaleDateString([], { dateStyle: 'medium' });
}
function formatDateTime(value: string) {
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}
function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function toLocalInput(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
function activityTitle(action: string) {
  return caseLabel(action.replace(/^CASE_/, 'Case '));
}
function activityIcon(action: string) {
  return action.includes('TASK') ? (
    <ListTodo size={14} />
  ) : action.includes('COMMENT') ? (
    <MessageSquarePlus size={14} />
  ) : action.includes('ATTACHMENT') ? (
    <FileText size={14} />
  ) : (
    <History size={14} />
  );
}
function activityDescription(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return '';
  const value = metadata as Record<string, unknown>;
  if (typeof value.from === 'string' && typeof value.to === 'string')
    return `${caseLabel(value.from)} → ${caseLabel(value.to)}`;
  return '';
}
