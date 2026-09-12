'use client';

import { AuthMessage } from '@/components/auth-screen';
import { useCurrentUser } from '@/components/auth-provider';
import { apiRequest } from '@/lib/api';
import type { AvailableMailbox, PaginatedMail } from '@/lib/mailbox-types';
import { Button, LoadingState, PageHeader, Pagination, Select } from '@unicrm/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, Mail, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { EmailThreadSheet } from './email-thread-sheet';

type MailView = 'INBOX' | 'SENT' | 'UNMATCHED';

export function MailboxInbox() {
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const [view, setView] = useState<MailView>('INBOX');
  const [mailboxId, setMailboxId] = useState('all');
  const [page, setPage] = useState(1);
  const [threadId, setThreadId] = useState<string | null>(null);
  const canManage = user.permissions.includes('mailbox.manage');
  const mailboxes = useQuery({
    queryKey: ['mailboxes'],
    queryFn: () => apiRequest<{ data: AvailableMailbox[] }>('/mail/mailboxes'),
    refetchInterval: (query) =>
      query.state.data?.data.some((mailbox) => mailbox.status === 'SYNCING') ? 2500 : false,
  });
  const queryString = new URLSearchParams({ view, page: String(page), limit: '25' });
  if (mailboxId !== 'all') queryString.set('mailboxId', mailboxId);
  const messages = useQuery({
    queryKey: ['mail', view, mailboxId, page],
    queryFn: () => apiRequest<PaginatedMail>(`/mail?${queryString}`),
    refetchInterval: 10_000,
  });
  const sync = useMutation({
    mutationFn: (id: string) => apiRequest(`/mailboxes/${id}/sync`, { method: 'POST' }),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['mailboxes'] }),
  });

  return (
    <div className="mail-page">
      <PageHeader
        title="Email"
        description="Synchronized mailbox conversations linked to your CRM records."
        actions={
          canManage && mailboxId !== 'all' ? (
            <Button
              variant="outline"
              loading={sync.isPending}
              onClick={() => sync.mutate(mailboxId)}
            >
              <RefreshCw size={15} /> Sync now
            </Button>
          ) : undefined
        }
      />
      <div className="mail-toolbar">
        <div className="mail-view-switcher" role="tablist" aria-label="Mailbox view">
          {(['INBOX', 'SENT', 'UNMATCHED'] as const).map((item) => (
            <button
              aria-selected={view === item}
              key={item}
              onClick={() => {
                setView(item);
                setPage(1);
              }}
              role="tab"
              type="button"
            >
              {item === 'UNMATCHED' ? 'Unmatched' : item === 'SENT' ? 'Sent' : 'Inbox'}
            </button>
          ))}
        </div>
        {mailboxes.data ? (
          <Select
            label="Mailbox"
            value={mailboxId}
            onValueChange={(value) => {
              setMailboxId(value ?? 'all');
              setPage(1);
            }}
            options={[
              { label: 'All mailboxes', value: 'all' },
              ...mailboxes.data.data.map((mailbox) => ({
                label: mailbox.emailAddress,
                value: mailbox.id,
              })),
            ]}
          />
        ) : null}
      </div>
      {messages.isLoading ? (
        <LoadingState label="Loading email" />
      ) : messages.isError ? (
        <AuthMessage>{messages.error.message}</AuthMessage>
      ) : messages.data?.data.length ? (
        <div className="mail-list" role="list">
          {messages.data.data.map((message) => (
            <button
              className="mail-list-row"
              disabled={!message.threadId}
              key={message.id}
              onClick={() => setThreadId(message.threadId)}
              role="listitem"
              type="button"
            >
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
              <span className="mail-sender">
                <strong>
                  {message.direction === 'INBOUND'
                    ? message.fromName
                    : message.toAddresses.join(', ')}
                </strong>
                <small>{message.mailboxConnection?.emailAddress}</small>
              </span>
              <span className="mail-subject">
                <strong>{message.subject}</strong>
                <small>{preview(message.body)}</small>
              </span>
              <span className="mail-related">
                {message.relatedEntityType ? formatEntity(message.relatedEntityType) : 'Unmatched'}
              </span>
              <time>{formatDate(message.receivedAt ?? message.sentAt ?? message.createdAt)}</time>
            </button>
          ))}
        </div>
      ) : (
        <div className="mail-empty">
          <Mail size={24} />
          <p>No messages in this view.</p>
        </div>
      )}
      {messages.data ? (
        <Pagination
          currentPage={page}
          totalPages={messages.data.meta.totalPages}
          onPageChange={setPage}
        />
      ) : null}
      <EmailThreadSheet threadId={threadId} onClose={() => setThreadId(null)} />
    </div>
  );
}

function preview(value: string) {
  return value.replace(/\s+/g, ' ').trim().slice(0, 110) || 'No preview';
}
function formatDate(value: string) {
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}
function formatEntity(type: string) {
  return type.charAt(0) + type.slice(1).toLowerCase();
}
