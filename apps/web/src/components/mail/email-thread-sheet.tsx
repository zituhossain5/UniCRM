'use client';

import { AuthMessage } from '@/components/auth-screen';
import { useCurrentUser } from '@/components/auth-provider';
import { apiBaseUrl, apiRequest } from '@/lib/api';
import { splitEmailReplyBody } from '@/lib/email-reply';
import { hasActiveEmailDelivery, shouldRefreshRelatedCrmActivity } from '@/lib/email-status';
import type { EmailThread, InboxUser, MailMessageSummary } from '@/lib/mailbox-types';
import type { ProjectRecord, TaskRecord } from '@/lib/work-types';
import type { SearchResults } from '@/lib/operational-types';
import { Badge, Button, Input, LoadingState, Select, Sheet, Textarea } from '@unicrm/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  FilePlus2,
  MessageSquarePlus,
  Paperclip,
  Reply,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

export function EmailThreadSheet({
  threadId,
  onClose,
  onDeliveryStatusChange,
}: {
  threadId: string | null;
  onClose: () => void;
  onDeliveryStatusChange?: () => void;
}) {
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [replyOpen, setReplyOpen] = useState(false);
  const [replySubjectValue, setReplySubjectValue] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteBody, setNoteBody] = useState('');
  const [conversionMode, setConversionMode] = useState<'lead' | 'task' | null>(null);
  const previousMessages = useRef<EmailThread['messages']>([]);
  const markedRead = useRef(new Set<string>());
  const thread = useQuery({
    queryKey: ['mail', 'thread', threadId],
    queryFn: () => apiRequest<{ data: EmailThread }>(`/mail/threads/${threadId}`),
    enabled: Boolean(threadId),
    refetchInterval: (query) =>
      query.state.data?.data.messages && hasActiveEmailDelivery(query.state.data.data.messages)
        ? 2500
        : false,
  });
  const searchResults = useQuery({
    queryKey: ['mail', 'link-search', search],
    queryFn: () =>
      apiRequest<{ data: SearchResults }>(`/search?q=${encodeURIComponent(search)}&limit=5`),
    enabled: search.trim().length >= 2,
  });
  const collaborators = useQuery({
    queryKey: ['mail', 'collaborators'],
    queryFn: () => apiRequest<{ data: InboxUser[] }>('/mail/collaborators'),
    enabled: Boolean(threadId),
  });
  const projects = useQuery({
    queryKey: ['mail', 'conversion-projects'],
    queryFn: () => apiRequest<{ data: ProjectRecord[] }>('/projects?limit=100&sort=name&order=asc'),
    enabled: Boolean(threadId && conversionMode === 'task'),
  });
  const linkOptions = useMemo(() => {
    const results = searchResults.data?.data;
    if (!results) return [];
    return [
      ...results.contacts.map((item) => ({
        value: `CONTACT:${item.id}`,
        label: `${item.firstName} ${item.lastName} · Contact`,
      })),
      ...results.leads.map((item) => ({ value: `LEAD:${item.id}`, label: `${item.title} · Lead` })),
      ...results.companies.map((item) => ({
        value: `COMPANY:${item.id}`,
        label: `${item.name} · Company`,
      })),
    ];
  }, [searchResults.data]);
  const current = thread.data?.data;
  const latestInbound = useMemo(
    () =>
      [...(current?.messages ?? [])].reverse().find((message) => message.direction === 'INBOUND'),
    [current?.messages],
  );
  const participants = useMemo(() => {
    if (!current) return [];
    return [
      ...new Set(
        current.messages.flatMap((message) => [message.fromAddress, ...message.toAddresses]),
      ),
    ];
  }, [current]);

  useEffect(() => {
    setError('');
    setSearch('');
    setReplyOpen(false);
    setReplyBody('');
    setNoteOpen(false);
    setNoteBody('');
    setConversionMode(null);
    previousMessages.current = [];
  }, [threadId]);

  useEffect(() => {
    if (!current) return;
    const previous = previousMessages.current;
    const reachedTerminalStatus = shouldRefreshRelatedCrmActivity(previous, current.messages);
    previousMessages.current = current.messages;
    if (current.relatedEntityType && current.relatedEntityId)
      void queryClient.invalidateQueries({
        queryKey: ['emails', 'history', current.relatedEntityType, current.relatedEntityId],
      });
    if (reachedTerminalStatus) onDeliveryStatusChange?.();
  }, [current, onDeliveryStatusChange, queryClient]);

  const refreshConversation = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['mail', 'thread', threadId] }),
      queryClient.invalidateQueries({ queryKey: ['mail', 'conversations'], exact: false }),
    ]);
  };

  const markRead = useMutation({
    mutationFn: () =>
      apiRequest(`/mail/threads/${threadId}/read`, {
        method: 'PATCH',
        body: JSON.stringify({ unread: false }),
      }),
    onSuccess: refreshConversation,
  });

  useEffect(() => {
    if (!current?.isUnread || markedRead.current.has(current.id)) return;
    markedRead.current.add(current.id);
    markRead.mutate();
  }, [current?.id, current?.isUnread]);

  const assignment = useMutation({
    mutationFn: (assignedUserId: string | null) =>
      apiRequest(`/mail/threads/${threadId}/assignment`, {
        method: 'PATCH',
        body: JSON.stringify({ assignedUserId }),
      }),
    onSuccess: refreshConversation,
    onError: (cause) => setError(messageFor(cause, 'Could not update assignee.')),
  });
  const status = useMutation({
    mutationFn: (payload: { status?: string; dueAt?: string | null }) =>
      apiRequest(`/mail/threads/${threadId}/status`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: refreshConversation,
    onError: (cause) => setError(messageFor(cause, 'Could not update conversation state.')),
  });
  const priority = useMutation({
    mutationFn: (value: string) =>
      apiRequest(`/mail/threads/${threadId}/priority`, {
        method: 'PATCH',
        body: JSON.stringify({ priority: value }),
      }),
    onSuccess: refreshConversation,
    onError: (cause) => setError(messageFor(cause, 'Could not update priority.')),
  });
  const note = useMutation({
    mutationFn: () =>
      apiRequest(`/mail/threads/${threadId}/notes`, {
        method: 'POST',
        body: JSON.stringify({ content: noteBody }),
      }),
    onSuccess: async () => {
      setNoteBody('');
      setNoteOpen(false);
      await refreshConversation();
    },
    onError: (cause) => setError(messageFor(cause, 'Could not add internal note.')),
  });
  const createLead = useMutation({
    mutationFn: (payload: Record<string, string>) =>
      apiRequest(`/mail/threads/${threadId}/create-lead`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      setConversionMode(null);
      await refreshConversation();
    },
    onError: (cause) => setError(messageFor(cause, 'Could not create Lead.')),
  });
  const createTask = useMutation({
    mutationFn: (payload: Record<string, string>) =>
      apiRequest<{ data: TaskRecord }>(`/mail/threads/${threadId}/create-task`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      setConversionMode(null);
      await refreshConversation();
    },
    onError: (cause) => setError(messageFor(cause, 'Could not create task.')),
  });

  const reply = useMutation({
    mutationFn: () =>
      apiRequest<{ data: MailMessageSummary }>(`/mail/threads/${threadId}/reply`, {
        method: 'POST',
        body: JSON.stringify({
          mailboxConnectionId: current?.mailboxConnection?.id,
          subject: replySubjectValue,
          body: replyBody,
        }),
      }),
    onSuccess: async () => {
      setReplyBody('');
      setReplyOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mail', 'thread', threadId] }),
        queryClient.invalidateQueries({ queryKey: ['mail'], exact: false }),
        ...(current?.relatedEntityType && current.relatedEntityId
          ? [
              queryClient.invalidateQueries({
                queryKey: ['emails', 'history', current.relatedEntityType, current.relatedEntityId],
              }),
            ]
          : []),
      ]);
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : 'Could not queue reply.'),
  });
  const link = useMutation({
    mutationFn: (value: string) => {
      const [relatedEntityType, relatedEntityId] = value.split(':');
      return apiRequest(`/mail/threads/${threadId}/link`, {
        method: 'POST',
        body: JSON.stringify({ relatedEntityType, relatedEntityId }),
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mail', 'thread', threadId] }),
        queryClient.invalidateQueries({ queryKey: ['mail'], exact: false }),
      ]);
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : 'Could not link thread.'),
  });

  function showReply() {
    if (!current) return;
    setError('');
    setReplySubjectValue(replySubject(current.subject));
    setReplyOpen(true);
  }

  function submitReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!reply.isPending) reply.mutate();
  }

  function submitNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!note.isPending) note.mutate();
  }

  function submitLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const data = new FormData(event.currentTarget);
    createLead.mutate(compactPayload(data, ['title', 'firstName', 'lastName', 'email', 'phone']));
  }

  function submitTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const data = new FormData(event.currentTarget);
    const payload = compactPayload(data, [
      'projectId',
      'title',
      'assigneeId',
      'dueDate',
      'priority',
    ]);
    if (payload.projectId === 'none') delete payload.projectId;
    if (payload.assigneeId === 'unassigned') delete payload.assigneeId;
    createTask.mutate(payload);
  }

  const canReply =
    user.permissions.includes('mail.send') &&
    user.permissions.includes('inbox.reply') &&
    Boolean(latestInbound) &&
    Boolean(current?.mailboxConnection) &&
    current?.mailboxConnection?.status !== 'DISABLED';
  const canAssign = user.permissions.includes('inbox.assign');
  const canUpdateStatus = user.permissions.includes('inbox.status.update');
  const canUpdatePriority = user.permissions.includes('inbox.priority.update');
  const canNote = user.permissions.includes('inbox.note');
  const canCreateLead = user.permissions.includes('lead.create');
  const canCreateTask = user.permissions.includes('task.create');
  const senderName = splitName(latestInbound?.fromName ?? '');

  return (
    <Sheet
      open={Boolean(threadId)}
      onOpenChange={(open) => !open && onClose()}
      popupClassName="email-thread-sheet"
      title={current?.subject ?? 'Conversation'}
      description="Chronological mailbox conversation and CRM association."
      trigger={
        <button className="visually-hidden" type="button">
          Open conversation
        </button>
      }
    >
      {error ? <AuthMessage>{error}</AuthMessage> : null}
      {thread.isLoading ? <LoadingState label="Loading conversation" /> : null}
      {thread.isError ? <AuthMessage>{thread.error.message}</AuthMessage> : null}
      {current ? (
        <>
          <section className="thread-workflow" aria-labelledby="thread-management-heading">
            <h3 id="thread-management-heading">Conversation</h3>
            <div className="thread-workflow-controls">
              <div className="thread-management-field">
                <Select
                  disabled={!canAssign || assignment.isPending}
                  label="Assignee"
                  value={current.assignedUserId ?? 'unassigned'}
                  onValueChange={(value) =>
                    assignment.mutate(value === 'unassigned' ? null : (value ?? null))
                  }
                  options={[
                    { label: 'Unassigned', value: 'unassigned' },
                    ...(collaborators.data?.data ?? []).map((person) => ({
                      label: personName(person),
                      value: person.id,
                    })),
                  ]}
                />
              </div>
              <div className="thread-management-field">
                <Select
                  disabled={!canUpdateStatus || status.isPending}
                  label="Status"
                  value={current.inboxStatus}
                  onValueChange={(value) => value && status.mutate({ status: value })}
                  options={['UNASSIGNED', 'OPEN', 'WAITING', 'RESOLVED', 'CLOSED'].map((value) => ({
                    label: labelize(value),
                    value,
                  }))}
                />
              </div>
              <div className="thread-management-field">
                <Select
                  disabled={!canUpdatePriority || priority.isPending}
                  label="Priority"
                  value={current.inboxPriority}
                  onValueChange={(value) => value && priority.mutate(value)}
                  options={['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((value) => ({
                    label: labelize(value),
                    value,
                  }))}
                />
              </div>
              <label className="thread-management-field">
                <span>Due</span>
                <Input
                  disabled={!canUpdateStatus || status.isPending}
                  key={current.dueAt ?? 'no-due-date'}
                  defaultValue={toLocalDateTime(current.dueAt)}
                  onBlur={(event) => {
                    const next = event.currentTarget.value;
                    status.mutate({ dueAt: next ? new Date(next).toISOString() : null });
                  }}
                  type="datetime-local"
                />
              </label>
            </div>
            <dl className="thread-meta">
              <div>
                <dt>Mailbox</dt>
                <dd>{current.mailboxConnection?.emailAddress ?? 'Legacy sender'}</dd>
              </div>
              <div>
                <dt>Participants</dt>
                <dd>{participants.join(', ') || 'Unknown'}</dd>
              </div>
              <div>
                <dt>Related</dt>
                <dd>
                  {current.relatedEntityType && current.relatedEntityId ? (
                    <Link href={entityHref(current.relatedEntityType, current.relatedEntityId)}>
                      {formatEntity(current.relatedEntityType)} · View record
                    </Link>
                  ) : (
                    'Unmatched'
                  )}
                </dd>
              </div>
            </dl>
          </section>
          {!current.relatedEntityId && user.permissions.includes('mail.link') ? (
            <div className="thread-linker">
              <Input
                aria-label="Search CRM records"
                placeholder="Search a Lead, Contact, or Company"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              {linkOptions.length ? (
                <Select
                  label="Link to CRM record"
                  placeholder="Select record"
                  options={linkOptions}
                  onValueChange={(value) => value && link.mutate(value)}
                />
              ) : null}
            </div>
          ) : null}
          <div className="thread-collaboration-actions" aria-label="Conversation actions">
            {canNote ? (
              <Button
                onClick={() => setNoteOpen((value) => !value)}
                type="button"
                variant="outline"
              >
                <MessageSquarePlus size={15} /> Internal note
              </Button>
            ) : null}
            {!current.relatedEntityId && canCreateLead ? (
              <Button onClick={() => setConversionMode('lead')} type="button" variant="outline">
                <FilePlus2 size={15} /> Create Lead
              </Button>
            ) : null}
            {canCreateTask ? (
              <Button onClick={() => setConversionMode('task')} type="button" variant="outline">
                <CheckCircle2 size={15} /> Create task
              </Button>
            ) : null}
          </div>
          {noteOpen ? (
            <form className="thread-note-form" onSubmit={submitNote}>
              <label>
                <span>Internal note</span>
                <Textarea
                  aria-describedby="thread-note-help"
                  maxLength={10000}
                  onChange={(event) => setNoteBody(event.target.value)}
                  required
                  rows={4}
                  value={noteBody}
                />
              </label>
              <small id="thread-note-help">
                Visible to your team only. This is never sent as email.
              </small>
              <div className="dialog-actions">
                <Button onClick={() => setNoteOpen(false)} type="button" variant="ghost">
                  Cancel
                </Button>
                <Button disabled={note.isPending} loading={note.isPending} type="submit">
                  Add internal note
                </Button>
              </div>
            </form>
          ) : null}
          {conversionMode === 'lead' ? (
            <form className="thread-conversion-form" onSubmit={submitLead}>
              <h3>Create Lead from conversation</h3>
              <label>
                <span>Lead title</span>
                <Input defaultValue={current.subject} maxLength={180} name="title" required />
              </label>
              <div className="form-two-columns">
                <label>
                  <span>First name</span>
                  <Input defaultValue={senderName.firstName} maxLength={100} name="firstName" />
                </label>
                <label>
                  <span>Last name</span>
                  <Input defaultValue={senderName.lastName} maxLength={100} name="lastName" />
                </label>
              </div>
              <label>
                <span>Email</span>
                <Input defaultValue={latestInbound?.fromAddress} name="email" type="email" />
              </label>
              <label>
                <span>Phone</span>
                <Input maxLength={40} name="phone" />
              </label>
              <div className="dialog-actions">
                <Button onClick={() => setConversionMode(null)} type="button" variant="ghost">
                  Cancel
                </Button>
                <Button
                  disabled={createLead.isPending}
                  loading={createLead.isPending}
                  type="submit"
                >
                  Create and link Lead
                </Button>
              </div>
            </form>
          ) : null}
          {conversionMode === 'task' ? (
            <form className="thread-conversion-form" onSubmit={submitTask}>
              <h3>Create task from conversation</h3>
              <Select
                label="Project"
                name="projectId"
                defaultValue="none"
                options={[
                  { label: 'No project', value: 'none' },
                  ...(projects.data?.data ?? []).map((project) => ({
                    label: project.name,
                    value: project.id,
                  })),
                ]}
              />
              <label>
                <span>Task title</span>
                <Input
                  defaultValue={`Follow up: ${current.subject}`}
                  maxLength={220}
                  name="title"
                  required
                />
              </label>
              <label>
                <span>Due date</span>
                <Input name="dueDate" type="date" />
              </label>
              <div className="form-two-columns">
                <Select
                  defaultValue="unassigned"
                  label="Assignee"
                  name="assigneeId"
                  options={[
                    { label: 'Unassigned', value: 'unassigned' },
                    ...(collaborators.data?.data ?? []).map((person) => ({
                      label: personName(person),
                      value: person.id,
                    })),
                  ]}
                />
                <Select
                  defaultValue="MEDIUM"
                  label="Priority"
                  name="priority"
                  options={['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((value) => ({
                    label: labelize(value),
                    value,
                  }))}
                />
              </div>
              <div className="dialog-actions">
                <Button onClick={() => setConversionMode(null)} type="button" variant="ghost">
                  Cancel
                </Button>
                <Button
                  disabled={createTask.isPending}
                  loading={createTask.isPending}
                  type="submit"
                >
                  Create task
                </Button>
              </div>
            </form>
          ) : null}
          {current.notes.length ? (
            <section className="thread-notes" aria-labelledby="thread-notes-heading">
              <h3 id="thread-notes-heading">Internal notes</h3>
              {current.notes.map((item) => (
                <article key={item.id}>
                  <header>
                    <strong>{personName(item.author)}</strong>
                    <time>{formatDate(item.createdAt)}</time>
                  </header>
                  <p>{item.content}</p>
                </article>
              ))}
            </section>
          ) : null}
          <div className="thread-messages">
            {current.messages.map((message) => {
              const body = splitEmailReplyBody(message.body);
              return (
                <article
                  className={`thread-message thread-message--${message.direction.toLowerCase()}`}
                  key={message.id}
                >
                  <header>
                    <span
                      className="mail-direction"
                      aria-label={message.direction === 'INBOUND' ? 'Incoming' : 'Outgoing'}
                    >
                      {message.direction === 'INBOUND' ? (
                        <ArrowDownLeft size={16} />
                      ) : (
                        <ArrowUpRight size={16} />
                      )}
                    </span>
                    <div>
                      <strong>{message.fromName || message.fromAddress}</strong>
                      <small>
                        {message.fromAddress} → {message.toAddresses.join(', ')}
                      </small>
                    </div>
                    <Badge
                      tone={
                        message.status === 'FAILED'
                          ? 'danger'
                          : message.status === 'SENT'
                            ? 'success'
                            : 'warning'
                      }
                    >
                      {message.direction === 'INBOUND'
                        ? 'INCOMING'
                        : `OUTGOING · ${message.status}`}
                    </Badge>
                  </header>
                  {shouldShowMessageSubject(current.subject, message.subject) ? (
                    <strong className="thread-message-subject">{message.subject}</strong>
                  ) : null}
                  <p className="thread-message-body">{body.visibleBody || '(No text body)'}</p>
                  {body.quotedBody ? (
                    <details className="thread-message-quote">
                      <summary>
                        <span className="thread-quote-show">… Show quoted text</span>
                        <span className="thread-quote-hide">Hide quoted text</span>
                      </summary>
                      <p>{body.quotedBody}</p>
                    </details>
                  ) : null}
                  {message.attachments.length ? (
                    <div className="thread-attachments">
                      {message.attachments.map((attachment) => (
                        <a
                          href={`${apiBaseUrl()}/mail/attachments/${attachment.id}/download`}
                          key={attachment.id}
                        >
                          <Paperclip size={13} /> {attachment.fileName}
                        </a>
                      ))}
                    </div>
                  ) : null}
                  <time>
                    {formatDate(message.receivedAt ?? message.sentAt ?? message.createdAt)}
                  </time>
                  {message.safeErrorSummary ? (
                    <small className="overdue-text">{message.safeErrorSummary}</small>
                  ) : null}
                </article>
              );
            })}
          </div>
          {canReply && !replyOpen ? (
            <div className="thread-reply-action">
              <Button onClick={showReply} type="button">
                <Reply size={15} /> Reply
              </Button>
            </div>
          ) : null}
          {canReply && replyOpen ? (
            <form className="dialog-form thread-reply" onSubmit={submitReply}>
              <h3>Reply</h3>
              <div className="thread-reply-routing">
                <span>
                  <strong>From</strong>
                  {current.mailboxConnection?.emailAddress}
                </span>
                <span>
                  <strong>To</strong>
                  {latestInbound?.fromAddress}
                </span>
              </div>
              <label>
                <span>Subject</span>
                <Input
                  value={replySubjectValue}
                  onChange={(event) => setReplySubjectValue(event.target.value)}
                  required
                />
              </label>
              <label>
                <span>Message</span>
                <Textarea
                  value={replyBody}
                  onChange={(event) => setReplyBody(event.target.value)}
                  rows={6}
                  required
                />
              </label>
              <div className="dialog-actions">
                <Button onClick={() => setReplyOpen(false)} type="button" variant="outline">
                  Cancel
                </Button>
                <Button type="submit" loading={reply.isPending} disabled={reply.isPending}>
                  Queue reply
                </Button>
              </div>
            </form>
          ) : null}
          {current.events.length ? (
            <details className="thread-history">
              <summary>Collaboration history ({current.events.length})</summary>
              <ol>
                {current.events.map((event) => (
                  <li key={event.id}>
                    <span>{eventLabel(event.type)}</span>
                    <small>
                      {event.actor ? personName(event.actor) : 'System'} ·{' '}
                      {formatDate(event.createdAt)}
                    </small>
                  </li>
                ))}
              </ol>
            </details>
          ) : null}
        </>
      ) : null}
    </Sheet>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}
function formatEntity(type: string) {
  return type.charAt(0) + type.slice(1).toLowerCase();
}
function entityHref(type: string, id: string) {
  const segment = type === 'COMPANY' ? 'companies' : type === 'CONTACT' ? 'contacts' : 'leads';
  return `/app/${segment}/${id}`;
}
function replySubject(subject: string) {
  return /^re:/i.test(subject) ? subject : `Re: ${subject}`;
}

function shouldShowMessageSubject(threadSubject: string, messageSubject: string) {
  const normalize = (value: string) =>
    value
      .replace(/^\s*(?:(?:re|fw|fwd):\s*)+/i, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  return normalize(threadSubject) !== normalize(messageSubject);
}

function compactPayload(form: FormData, fields: string[]) {
  return Object.fromEntries(
    fields
      .map((field) => {
        const value = form.get(field);
        return [field, typeof value === 'string' ? value.trim() : ''] as const;
      })
      .filter(([, value]) => value.length > 0),
  );
}

function splitName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') };
}

function personName(person: InboxUser) {
  return `${person.firstName} ${person.lastName}`.trim() || person.email;
}

function labelize(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase().replaceAll('_', ' ');
}

function toLocalDateTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

function eventLabel(type: EmailThread['events'][number]['type']) {
  const labels: Record<EmailThread['events'][number]['type'], string> = {
    ASSIGNED: 'Conversation assigned',
    REASSIGNED: 'Conversation reassigned',
    UNASSIGNED: 'Conversation unassigned',
    STATUS_CHANGED: 'Status changed',
    PRIORITY_CHANGED: 'Priority changed',
    DUE_AT_CHANGED: 'Due time changed',
    NOTE_ADDED: 'Internal note added',
    CRM_LINKED: 'CRM record linked',
    RESOLVED: 'Conversation resolved',
    REOPENED: 'Conversation reopened',
  };
  return labels[type];
}

function messageFor(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}
