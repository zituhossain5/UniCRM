'use client';

import { AuthMessage } from '@/components/auth-screen';
import { useCurrentUser } from '@/components/auth-provider';
import { apiBaseUrl, apiRequest } from '@/lib/api';
import { hasActiveEmailDelivery, shouldRefreshRelatedCrmActivity } from '@/lib/email-status';
import type { EmailThread, MailMessageSummary } from '@/lib/mailbox-types';
import type { SearchResults } from '@/lib/operational-types';
import { Badge, Button, Input, LoadingState, Select, Sheet, Textarea } from '@unicrm/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, Paperclip, Reply } from 'lucide-react';
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
  const previousMessages = useRef<EmailThread['messages']>([]);
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

  const canReply =
    user.permissions.includes('mail.send') &&
    Boolean(latestInbound) &&
    Boolean(current?.mailboxConnection) &&
    current?.mailboxConnection?.status !== 'DISABLED';

  return (
    <Sheet
      open={Boolean(threadId)}
      onOpenChange={(open) => !open && onClose()}
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
          <div className="thread-meta">
            <span>
              Mailbox:{' '}
              {current.mailboxConnection
                ? `${current.mailboxConnection.name} <${current.mailboxConnection.emailAddress}>`
                : 'Legacy sender'}
            </span>
            <span>Participants: {participants.join(', ') || 'Unknown'}</span>
            <span>
              Related:{' '}
              {current.relatedEntityType && current.relatedEntityId ? (
                <Link href={entityHref(current.relatedEntityType, current.relatedEntityId)}>
                  {formatEntity(current.relatedEntityType)}
                </Link>
              ) : (
                'Unmatched'
              )}
            </span>
          </div>
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
          <div className="thread-messages">
            {current.messages.map((message) => (
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
                    {message.direction === 'INBOUND' ? 'INCOMING' : `OUTGOING · ${message.status}`}
                  </Badge>
                </header>
                <strong className="thread-message-subject">{message.subject}</strong>
                <p className="thread-message-body">{message.body || '(No text body)'}</p>
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
                <time>{formatDate(message.receivedAt ?? message.sentAt ?? message.createdAt)}</time>
                {message.safeErrorSummary ? (
                  <small className="overdue-text">{message.safeErrorSummary}</small>
                ) : null}
              </article>
            ))}
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
