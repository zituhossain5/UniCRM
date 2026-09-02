'use client';

import { AuthMessage } from '@/components/auth-screen';
import { useCurrentUser } from '@/components/auth-provider';
import { apiBaseUrl, apiRequest } from '@/lib/api';
import { emitCrmDataChanged } from '@/lib/crm-events';
import { labelize, personName } from '@/lib/crm-types';
import { useWorkReferenceData } from '@/lib/work-reference-data';
import {
  formatDateOnly,
  taskStatuses,
  workPriorities,
  type AttachmentRecord,
  type TaskComment,
  type TaskRecord,
} from '@/lib/work-types';
import {
  Badge,
  Button,
  ConfirmationDialog,
  Input,
  LoadingState,
  Select,
  Sheet,
  Textarea,
} from '@unicrm/ui';
import { Download, Paperclip, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';

export function TaskQuickView({
  onChanged,
  onOpenChange,
  open,
  taskId,
}: {
  onChanged?: () => Promise<void> | void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  taskId: string | null;
}) {
  const current = useCurrentUser();
  const references = useWorkReferenceData();
  const formId = `task-edit-${useId().replaceAll(':', '')}`;
  const [task, setTask] = useState<TaskRecord>();
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [attachments, setAttachments] = useState<AttachmentRecord[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!taskId) return;
    setError('');
    try {
      const requests: [
        Promise<{ data: TaskRecord }>,
        Promise<{ data: TaskComment[] }> | null,
        Promise<{ data: AttachmentRecord[] }> | null,
      ] = [
        apiRequest(`/tasks/${taskId}`),
        current.permissions.includes('task.comment.read')
          ? apiRequest(`/tasks/${taskId}/comments`)
          : null,
        current.permissions.includes('attachment.read')
          ? apiRequest(`/tasks/${taskId}/attachments`)
          : null,
      ];
      const [taskResult, commentResult, attachmentResult] = await Promise.all(
        requests.map((request) => request ?? Promise.resolve(null)),
      );
      setTask((taskResult as { data: TaskRecord }).data);
      setComments((commentResult as { data: TaskComment[] } | null)?.data ?? []);
      setAttachments((attachmentResult as { data: AttachmentRecord[] } | null)?.data ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load task.');
    }
  }, [current.permissions, taskId]);
  useEffect(() => {
    if (open) void load();
    else setTask(undefined);
  }, [load, open]);

  async function update(body: Record<string, unknown>) {
    if (!taskId) return false;
    setBusy(true);
    setError('');
    try {
      await apiRequest(`/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(body) });
      emitCrmDataChanged(['tasks', 'projects']);
      await Promise.all([load(), onChanged?.()]);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Task update failed.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<
      string,
      string | number | null
    >;
    data.estimatedMinutes = data.estimatedMinutes === '' ? null : Number(data.estimatedMinutes);
    for (const key of ['assigneeId', 'startDate', 'dueDate', 'description'])
      if (data[key] === '') data[key] = null;
    await update(data);
  }

  async function addComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!taskId) return;
    const form = event.currentTarget;
    const content = new FormData(form).get('content');
    setBusy(true);
    setError('');
    try {
      await apiRequest(`/tasks/${taskId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      });
      form.reset();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add comment.');
    } finally {
      setBusy(false);
    }
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!taskId) return;
    const form = event.currentTarget;
    setBusy(true);
    setError('');
    try {
      await apiRequest(`/tasks/${taskId}/attachments`, {
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

  async function archive() {
    if (!taskId) return;
    setBusy(true);
    try {
      await apiRequest(`/tasks/${taskId}`, { method: 'DELETE' });
      emitCrmDataChanged(['tasks', 'projects']);
      onOpenChange(false);
      await onChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not archive task.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      description={task ? task.project.name : 'Task details'}
      onOpenChange={onOpenChange}
      open={open}
      title={task?.title ?? 'Task'}
      trigger={
        <button className="visually-hidden" type="button">
          Open task
        </button>
      }
    >
      {!task && !error ? <LoadingState label="Loading task" /> : null}
      {error ? <AuthMessage>{error}</AuthMessage> : null}
      {task ? (
        <div className="task-detail">
          <div className="task-detail-heading">
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
            <Link href={`/app/projects/${task.projectId}`}>{task.project.name}</Link>
          </div>
          {current.permissions.includes('task.update') ? (
            <form
              className="dialog-form task-edit-form"
              id={formId}
              onSubmit={(event) => void submitEdit(event)}
            >
              <label>
                <span>Title</span>
                <Input defaultValue={task.title} name="title" required />
              </label>
              <div className="form-two-columns">
                <Select
                  defaultValue={task.status}
                  label="Status"
                  name="status"
                  options={taskStatuses.map((value) => ({ label: labelize(value), value }))}
                />
                <Select
                  defaultValue={task.priority}
                  label="Priority"
                  name="priority"
                  options={workPriorities.map((value) => ({ label: labelize(value), value }))}
                />
              </div>
              {current.permissions.includes('task.assign') ? (
                <Select
                  defaultValue={task.assigneeId ?? undefined}
                  label="Assignee"
                  name="assigneeId"
                  options={[
                    { label: 'Unassigned', value: '' },
                    ...references.users.map((user) => ({
                      label: personName(user),
                      value: user.id,
                    })),
                  ]}
                />
              ) : null}
              <div className="form-two-columns">
                <label>
                  <span>Start date</span>
                  <Input
                    defaultValue={task.startDate?.slice(0, 10) ?? ''}
                    name="startDate"
                    type="date"
                  />
                </label>
                <label>
                  <span>Due date</span>
                  <Input
                    defaultValue={task.dueDate?.slice(0, 10) ?? ''}
                    name="dueDate"
                    type="date"
                  />
                </label>
              </div>
              <label>
                <span>Estimated minutes</span>
                <Input
                  defaultValue={task.estimatedMinutes ?? ''}
                  min="1"
                  name="estimatedMinutes"
                  type="number"
                />
              </label>
              <label>
                <span>Description</span>
                <Textarea defaultValue={task.description ?? ''} name="description" />
              </label>
              <div className="inline-actions">
                <Button loading={busy} type="submit">
                  Save task
                </Button>
                {current.permissions.includes('task.delete') ? (
                  <ConfirmationDialog
                    confirmLabel="Archive"
                    description="The task and its comments will remain stored but leave active lists."
                    onConfirm={() => void archive()}
                    title="Archive task?"
                    trigger={
                      <Button disabled={busy} variant="ghost">
                        <Trash2 size={14} /> Archive
                      </Button>
                    }
                  />
                ) : null}
              </div>
            </form>
          ) : (
            <dl className="detail-list">
              <div>
                <dt>Assignee</dt>
                <dd>{personName(task.assignee)}</dd>
              </div>
              <div>
                <dt>Priority</dt>
                <dd>{labelize(task.priority)}</dd>
              </div>
              <div>
                <dt>Due date</dt>
                <dd>{formatDateOnly(task.dueDate)}</dd>
              </div>
              <div>
                <dt>Description</dt>
                <dd>{task.description || '-'}</dd>
              </div>
            </dl>
          )}
          {current.permissions.includes('task.comment.read') ? (
            <section className="task-subsection">
              <h3>Comments</h3>
              <div className="comment-list">
                {comments.length ? (
                  comments.map((comment) => (
                    <article key={comment.id}>
                      <div>
                        <strong>{personName(comment.user)}</strong>
                        <time>{new Date(comment.createdAt).toLocaleString()}</time>
                      </div>
                      <p>{comment.content}</p>
                      {current.permissions.includes('task.comment.create') &&
                      (comment.user.id === current.id ||
                        current.permissions.includes('task.delete')) ? (
                        <button
                          aria-label="Delete comment"
                          onClick={() =>
                            void apiRequest(`/tasks/${task.id}/comments/${comment.id}`, {
                              method: 'DELETE',
                            }).then(load)
                          }
                          type="button"
                        >
                          <Trash2 size={13} />
                        </button>
                      ) : null}
                    </article>
                  ))
                ) : (
                  <p className="record-empty">No comments yet.</p>
                )}
              </div>
              {current.permissions.includes('task.comment.create') ? (
                <form className="comment-form" onSubmit={(event) => void addComment(event)}>
                  <Textarea
                    aria-label="Add comment"
                    name="content"
                    placeholder="Add comment..."
                    required
                  />
                  <Button loading={busy} type="submit">
                    Comment
                  </Button>
                </form>
              ) : null}
            </section>
          ) : null}
          {current.permissions.includes('attachment.read') ? (
            <section className="task-subsection">
              <h3>Files</h3>
              <div className="file-list">
                {attachments.length ? (
                  attachments.map((file) => (
                    <div key={file.id}>
                      <Paperclip size={14} />
                      <span>
                        <strong>{file.fileName}</strong>
                        <small>
                          {formatSize(file.size)} · {personName(file.uploadedBy)}
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
                            void apiRequest(`/attachments/${file.id}`, { method: 'DELETE' }).then(
                              load,
                            )
                          }
                          type="button"
                        >
                          <Trash2 size={14} />
                        </button>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="record-empty">No files attached.</p>
                )}
              </div>
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
            </section>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
