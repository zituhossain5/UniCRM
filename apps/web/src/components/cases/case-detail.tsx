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
import {
  Badge,
  Button,
  ErrorState,
  Input,
  LoadingState,
  PageHeader,
  Select,
  Textarea,
} from '@unicrm/ui';
import { Archive, Download, ExternalLink, Paperclip, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

export function CaseDetail({ id }: { id: string }) {
  const current = useCurrentUser();
  const router = useRouter();
  const { users } = useCrmReferenceData({ users: current.permissions.includes('user.read') });
  const [record, setRecord] = useState<CustomerCase>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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
      setRecord(
        (
          await apiRequest<{ data: CustomerCase }>(`/cases/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          })
        ).data,
      );
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
  return (
    <div className="record-page case-detail-page">
      <PageHeader
        title={`${record.caseNumber} · ${record.title}`}
        description={`${caseLabel(record.type)} · Created ${new Date(record.createdAt).toLocaleString()}`}
        actions={
          <div className="page-actions">
            <Link href="/app/cases">
              <Button variant="outline">Back to cases</Button>
            </Link>
            {current.permissions.includes('case.delete') ? (
              <Button
                variant="destructive"
                onClick={() => {
                  if (window.confirm(`Archive ${record.caseNumber}?`))
                    void apiRequest(`/cases/${id}`, { method: 'DELETE' })
                      .then(() => router.push('/app/cases'))
                      .catch((cause) =>
                        setError(
                          cause instanceof Error ? cause.message : 'Could not archive case.',
                        ),
                      );
                }}
              >
                <Archive size={14} />
                Archive
              </Button>
            ) : null}
          </div>
        }
      />
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="case-detail-grid">
        <section className="record-section case-summary">
          <div className="section-heading">
            <h2>Case details</h2>
          </div>
          <div className="case-field-grid">
            <label>
              Status
              <Select
                disabled={!canUpdate || busy}
                value={record.status}
                onValueChange={(value) => value && void update({ status: value })}
                options={caseStatuses.map((value) => ({ value, label: caseLabel(value) }))}
              />
            </label>
            <label>
              Priority
              <Select
                disabled={!canUpdate || busy}
                value={record.priority}
                onValueChange={(value) => value && void update({ priority: value })}
                options={casePriorities.map((value) => ({ value, label: caseLabel(value) }))}
              />
            </label>
            <label>
              Type
              <Select
                disabled={!canUpdate || busy}
                value={record.type}
                onValueChange={(value) => value && void update({ type: value })}
                options={caseTypes.map((value) => ({ value, label: caseLabel(value) }))}
              />
            </label>
            <label>
              Assignee
              <Select
                disabled={!current.permissions.includes('case.assign') || busy}
                value={record.assignedUserId ?? ''}
                onValueChange={(value) => void update({ assignedUserId: value || null })}
                options={[{ value: '', label: 'Unassigned' }, ...userOptions(users)]}
              />
            </label>
            <label>
              Due date
              <Input
                disabled={!canUpdate || busy}
                type="datetime-local"
                defaultValue={record.dueAt?.slice(0, 16) ?? ''}
                onBlur={(event) => void update({ dueAt: event.target.value || null })}
              />
            </label>
          </div>
          <h3>Description</h3>
          <p className="preserve-lines">{record.description || 'No description.'}</p>
          <div className="case-links">
            {record.contact ? (
              <Link href={`/app/contacts/${record.contact.id}`}>
                Contact: {record.contact.firstName} {record.contact.lastName}
              </Link>
            ) : null}
            {record.company ? (
              <Link href={`/app/companies/${record.company.id}`}>
                Company: {record.company.name}
              </Link>
            ) : null}
            {record.lead ? (
              <Link href={`/app/leads/${record.lead.id}`}>Lead: {record.lead.title}</Link>
            ) : null}
            {record.deal ? (
              <Link href={`/app/deals/${record.deal.id}`}>Deal: {record.deal.name}</Link>
            ) : null}
            {record.sourceThread ? (
              <Link href={`/app/email?thread=${record.sourceThread.id}`}>
                Email: {record.sourceThread.subject} <ExternalLink size={13} />
              </Link>
            ) : null}
          </div>
        </section>
        <section className="record-section">
          <div className="section-heading">
            <h2>Internal comments</h2>
            <Badge>{record.comments?.length ?? 0}</Badge>
          </div>
          <div className="case-feed">
            {record.comments?.map((comment) => (
              <article key={comment.id}>
                <strong>
                  {comment.author.firstName} {comment.author.lastName}
                </strong>
                <small>{new Date(comment.createdAt).toLocaleString()}</small>
                <p>{comment.content}</p>
              </article>
            ))}
          </div>
          {current.permissions.includes('case.comment') ? (
            <form
              className="inline-compose"
              onSubmit={(event) => void submitForm(event, `/cases/${id}/comments`)}
            >
              <Textarea
                aria-label="Internal comment"
                name="content"
                placeholder="Add an internal comment..."
                required
                rows={2}
              />
              <Button disabled={busy} type="submit">
                Add comment
              </Button>
            </form>
          ) : null}
        </section>
        <section className="record-section">
          <div className="section-heading">
            <h2>Tasks</h2>
            <Badge>{record.tasks?.length ?? 0}</Badge>
          </div>
          <div className="case-feed">
            {record.tasks?.map((task) => (
              <article key={task.id}>
                <strong>{task.title}</strong>
                <Badge>{caseLabel(task.status)}</Badge>
                <small>
                  {task.assignee
                    ? `${task.assignee.firstName} ${task.assignee.lastName}`
                    : 'Unassigned'}
                  {task.dueDate ? ` · ${new Date(task.dueDate).toLocaleDateString()}` : ''}
                </small>
              </article>
            ))}
          </div>
          {current.permissions.includes('task.create') ? (
            <form
              className="inline-compose"
              onSubmit={(event) => void submitForm(event, `/cases/${id}/tasks`)}
            >
              <Input
                aria-label="Task title"
                name="title"
                placeholder="Create a task for this case"
                required
              />
              <Button disabled={busy} type="submit">
                <Plus size={14} />
                Create task
              </Button>
            </form>
          ) : null}
        </section>
        <section className="record-section">
          <div className="section-heading">
            <h2>Attachments</h2>
            <Badge>{record.attachments?.length ?? 0}</Badge>
          </div>
          <div className="case-feed">
            {record.attachments?.map((file) => (
              <article key={file.id}>
                <Paperclip size={14} />
                <strong>{file.fileName}</strong>
                <small>{Math.ceil(file.size / 1024)} KB</small>
                <a
                  aria-label={`Download ${file.fileName}`}
                  href={`${apiBaseUrl()}/attachments/${file.id}/download`}
                >
                  <Download size={14} />
                </a>
              </article>
            ))}
          </div>
          {current.permissions.includes('attachment.create') && canUpdate ? (
            <form className="inline-compose" onSubmit={(event) => void upload(event)}>
              <Input
                accept=".pdf,.docx,.jpg,.jpeg,.png,.csv,.txt"
                name="file"
                type="file"
                required
              />
              <Button disabled={busy} type="submit">
                Upload
              </Button>
            </form>
          ) : null}
        </section>
        <section className="record-section case-history">
          <div className="section-heading">
            <h2>Activity history</h2>
          </div>
          <div className="case-feed">
            {record.activity?.map((item) => (
              <article key={item.id}>
                <strong>{caseLabel(item.action)}</strong>
                <small>
                  {item.actor ? `${item.actor.firstName} ${item.actor.lastName} · ` : ''}
                  {new Date(item.createdAt).toLocaleString()}
                </small>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
