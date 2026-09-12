'use client';

import { AuthMessage } from '@/components/auth-screen';
import { useCurrentUser } from '@/components/auth-provider';
import { apiRequest } from '@/lib/api';
import type {
  AvailableMailbox,
  InboxConversationSummary,
  InboxUser,
  PaginatedInboxConversations,
} from '@/lib/mailbox-types';
import {
  Badge,
  Button,
  Input,
  LoadingState,
  PageHeader,
  Pagination,
  Popover,
  Select,
} from '@unicrm/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  ChevronDown,
  Clock3,
  Inbox,
  Link2Off,
  Mail,
  MailOpen,
  RefreshCw,
  Search,
  Send,
  SlidersHorizontal,
  UserMinus,
  UserRoundCheck,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { EmailThreadSheet } from './email-thread-sheet';

type InboxView =
  'INBOX' | 'UNASSIGNED' | 'MINE' | 'OPEN' | 'WAITING' | 'RESOLVED' | 'UNMATCHED' | 'SENT';

const views = [
  { icon: Inbox, label: 'Inbox', value: 'INBOX' },
  { icon: UserMinus, label: 'Unassigned', value: 'UNASSIGNED' },
  { icon: UserRoundCheck, label: 'Mine', value: 'MINE' },
  { icon: MailOpen, label: 'Open', value: 'OPEN' },
  { icon: Clock3, label: 'Waiting', value: 'WAITING' },
  { icon: CheckCircle2, label: 'Resolved', value: 'RESOLVED' },
  { icon: Link2Off, label: 'Unmatched', value: 'UNMATCHED' },
  { icon: Send, label: 'Sent', value: 'SENT' },
] satisfies Array<{ icon: typeof Inbox; label: string; value: InboxView }>;

const statusOptions = ['all', 'UNASSIGNED', 'OPEN', 'WAITING', 'RESOLVED', 'CLOSED'].map(
  (value) => ({
    label: value === 'all' ? 'All statuses' : labelize(value),
    value,
  }),
);
const priorityOptions = ['all', 'LOW', 'NORMAL', 'HIGH', 'URGENT'].map((value) => ({
  label: value === 'all' ? 'All priorities' : labelize(value),
  value,
}));
const unreadOptions = [
  { label: 'Read and unread', value: 'all' },
  { label: 'Unread only', value: 'true' },
  { label: 'Read only', value: 'false' },
];
const dueOptions = [
  { label: 'Any due time', value: 'all' },
  { label: 'Due within 24 hours', value: 'soon' },
  { label: 'Overdue', value: 'overdue' },
];

export function MailboxInbox({ initialThreadId = null }: { initialThreadId?: string | null }) {
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const [view, setView] = useState<InboxView>('INBOX');
  const [mailboxId, setMailboxId] = useState('all');
  const [assigneeId, setAssigneeId] = useState('all');
  const [status, setStatus] = useState('all');
  const [priority, setPriority] = useState('all');
  const [unread, setUnread] = useState('all');
  const [due, setDue] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [threadId, setThreadId] = useState<string | null>(initialThreadId);
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const canManage = user.permissions.includes('mailbox.manage');
  const mailboxes = useQuery({
    queryKey: ['mailboxes'],
    queryFn: () => apiRequest<{ data: AvailableMailbox[] }>('/mail/mailboxes'),
    refetchInterval: (query) =>
      query.state.data?.data.some((mailbox) => mailbox.status === 'SYNCING') ? 2500 : false,
  });
  const collaborators = useQuery({
    queryKey: ['mail', 'collaborators'],
    queryFn: () => apiRequest<{ data: InboxUser[] }>('/mail/collaborators'),
  });
  const queryString = new URLSearchParams({ view, page: String(page), limit: '25' });
  if (mailboxId !== 'all') queryString.set('mailboxId', mailboxId);
  if (assigneeId !== 'all') queryString.set('assigneeId', assigneeId);
  if (status !== 'all') queryString.set('status', status);
  if (priority !== 'all') queryString.set('priority', priority);
  if (unread !== 'all') queryString.set('unread', unread);
  if (due !== 'all') queryString.set('due', due);
  if (search.trim()) queryString.set('search', search.trim());
  const conversations = useQuery({
    queryKey: [
      'mail',
      'conversations',
      view,
      mailboxId,
      assigneeId,
      status,
      priority,
      unread,
      due,
      search,
      page,
    ],
    queryFn: () =>
      apiRequest<PaginatedInboxConversations>(`/mail/conversations?${queryString.toString()}`),
    refetchInterval: 10_000,
  });
  const sync = useMutation({
    mutationFn: (id: string) => apiRequest(`/mailboxes/${id}/sync`, { method: 'POST' }),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['mailboxes'] }),
  });

  function resetPage() {
    setPage(1);
  }

  function clearFilters() {
    setMailboxId('all');
    setAssigneeId('all');
    setStatus('all');
    setPriority('all');
    setUnread('all');
    setDue('all');
    resetPage();
  }

  function clearSecondaryFilters() {
    setUnread('all');
    setDue('all');
    resetPage();
  }

  const activeFilters = [
    mailboxId !== 'all'
      ? {
          key: 'mailbox',
          label:
            mailboxes.data?.data.find((mailbox) => mailbox.id === mailboxId)?.emailAddress ??
            'Mailbox',
          onClear: () => setMailboxId('all'),
        }
      : null,
    assigneeId !== 'all'
      ? {
          key: 'assignee',
          label: (() => {
            const person = collaborators.data?.data.find((item) => item.id === assigneeId);
            return person ? personName(person) : 'Assignee';
          })(),
          onClear: () => setAssigneeId('all'),
        }
      : null,
    status !== 'all'
      ? { key: 'status', label: labelize(status), onClear: () => setStatus('all') }
      : null,
    priority !== 'all'
      ? { key: 'priority', label: labelize(priority), onClear: () => setPriority('all') }
      : null,
    unread !== 'all'
      ? {
          key: 'unread',
          label: unread === 'true' ? 'Unread only' : 'Read only',
          onClear: () => setUnread('all'),
        }
      : null,
    due !== 'all'
      ? {
          key: 'due',
          label: due === 'soon' ? 'Due within 24 hours' : 'Overdue',
          onClear: () => setDue('all'),
        }
      : null,
  ].filter((filter): filter is NonNullable<typeof filter> => filter !== null);

  const activeViewLabel = views.find((item) => item.value === view)?.label ?? 'Inbox';
  const secondaryFilterCount = Number(unread !== 'all') + Number(due !== 'all');

  return (
    <div className="mail-page shared-inbox-page">
      <PageHeader
        title="Shared inbox"
        description="Assign, prioritize, and resolve synchronized customer conversations together."
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
      <div className="shared-inbox-mobile-view">
        <Select
          label="Inbox view"
          value={view}
          onValueChange={(value) => {
            setView((value ?? 'INBOX') as InboxView);
            resetPage();
          }}
          options={views}
        />
      </div>
      <div className="shared-inbox-workspace">
        <aside className="shared-inbox-sidebar" aria-label="Email views">
          <span className="shared-inbox-sidebar-title">Views</span>
          <nav className="shared-inbox-nav">
            {views.map((item) => {
              const ViewIcon = item.icon;
              return (
                <button
                  aria-current={view === item.value ? 'page' : undefined}
                  key={item.value}
                  onClick={() => {
                    setView(item.value);
                    resetPage();
                  }}
                  type="button"
                >
                  <ViewIcon aria-hidden="true" size={16} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <section className="shared-inbox-main" aria-label={`${activeViewLabel} conversations`}>
          <div className="shared-inbox-toolbar">
            <label className="shared-inbox-search">
              <span className="visually-hidden">Search conversations</span>
              <Search aria-hidden="true" size={15} />
              <Input
                placeholder="Search subject, sender, or message"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  resetPage();
                }}
              />
            </label>
            <div className="shared-inbox-primary-filters">
              <div className="shared-inbox-filter-field shared-inbox-filter-field--mailbox">
                <Select
                  label="Mailbox"
                  value={mailboxId}
                  onValueChange={(value) => {
                    setMailboxId(value ?? 'all');
                    resetPage();
                  }}
                  options={[
                    { label: 'All mailboxes', value: 'all' },
                    ...(mailboxes.data?.data ?? []).map((mailbox) => ({
                      label: mailbox.emailAddress,
                      value: mailbox.id,
                    })),
                  ]}
                />
              </div>
              <div className="shared-inbox-filter-field shared-inbox-filter-field--assignee">
                <Select
                  label="Assignee"
                  value={assigneeId}
                  onValueChange={(value) => {
                    setAssigneeId(value ?? 'all');
                    resetPage();
                  }}
                  options={[
                    { label: 'All assignees', value: 'all' },
                    ...(collaborators.data?.data ?? []).map((person) => ({
                      label: personName(person),
                      value: person.id,
                    })),
                  ]}
                />
              </div>
              <div className="shared-inbox-filter-field shared-inbox-filter-field--status">
                <Select
                  label="Status"
                  value={status}
                  onValueChange={(value) => {
                    setStatus(value ?? 'all');
                    resetPage();
                  }}
                  options={statusOptions}
                />
              </div>
              <div className="shared-inbox-filter-field shared-inbox-filter-field--priority">
                <Select
                  label="Priority"
                  value={priority}
                  onValueChange={(value) => {
                    setPriority(value ?? 'all');
                    resetPage();
                  }}
                  options={priorityOptions}
                />
              </div>
              <Popover
                onOpenChange={setMoreFiltersOpen}
                open={moreFiltersOpen}
                popupClassName="shared-inbox-more-popover"
                trigger={
                  <Button className="shared-inbox-more-button" variant="outline">
                    <SlidersHorizontal aria-hidden="true" size={15} />
                    {secondaryFilterCount ? `Filters (${secondaryFilterCount})` : 'More filters'}
                    <ChevronDown aria-hidden="true" size={14} />
                  </Button>
                }
              >
                <div className="shared-inbox-more-filters">
                  <Select
                    label="Read state"
                    value={unread}
                    onValueChange={(value) => {
                      setUnread(value ?? 'all');
                      resetPage();
                    }}
                    options={unreadOptions}
                  />
                  <Select
                    label="Due"
                    value={due}
                    onValueChange={(value) => {
                      setDue(value ?? 'all');
                      resetPage();
                    }}
                    options={dueOptions}
                  />
                  {secondaryFilterCount ? (
                    <Button onClick={clearSecondaryFilters} variant="ghost">
                      Clear filters
                    </Button>
                  ) : null}
                </div>
              </Popover>
            </div>
          </div>
          {activeFilters.length ? (
            <div className="shared-inbox-active-filters" aria-label="Active filters" role="group">
              <span className="shared-inbox-filter-count">Filters ({activeFilters.length})</span>
              {activeFilters.map((filter) => (
                <button
                  aria-label={`Remove ${filter.label} filter`}
                  className="shared-inbox-filter-chip"
                  key={filter.key}
                  onClick={() => {
                    filter.onClear();
                    resetPage();
                  }}
                  type="button"
                >
                  {filter.label} <X aria-hidden="true" size={13} />
                </button>
              ))}
              <button className="shared-inbox-clear-filters" onClick={clearFilters} type="button">
                Clear all
              </button>
            </div>
          ) : null}

          <div className="shared-inbox-list-heading">
            <strong>{activeViewLabel}</strong>
            {conversations.data ? (
              <span>
                {conversations.data.meta.total}{' '}
                {conversations.data.meta.total === 1 ? 'conversation' : 'conversations'}
              </span>
            ) : null}
          </div>
          {conversations.isLoading ? (
            <LoadingState label="Loading shared inbox" />
          ) : conversations.isError ? (
            <AuthMessage>{conversations.error.message}</AuthMessage>
          ) : conversations.data?.data.length ? (
            <div className="mail-list" role="list">
              {conversations.data.data.map((conversation) => (
                <ConversationRow
                  conversation={conversation}
                  key={conversation.id}
                  onOpen={() => setThreadId(conversation.id)}
                />
              ))}
            </div>
          ) : (
            <div className="mail-empty">
              <Mail size={24} />
              <p>No conversations match this view.</p>
            </div>
          )}
          {conversations.data ? (
            <Pagination
              currentPage={page}
              totalPages={conversations.data.meta.totalPages}
              onPageChange={setPage}
            />
          ) : null}
        </section>
      </div>
      <EmailThreadSheet threadId={threadId} onClose={() => setThreadId(null)} />
    </div>
  );
}

function ConversationRow({
  conversation,
  onOpen,
}: {
  conversation: InboxConversationSummary;
  onOpen: () => void;
}) {
  const latest = conversation.messages[0];
  return (
    <button
      className={`mail-list-row shared-inbox-row${conversation.isUnread ? ' shared-inbox-row--unread' : ''}`}
      onClick={onOpen}
      role="listitem"
      type="button"
    >
      <span
        className="shared-inbox-unread"
        aria-label={conversation.isUnread ? 'Unread' : 'Read'}
      />
      <span className="mail-sender">
        <strong>{latest?.fromName || latest?.fromAddress || 'Unknown sender'}</strong>
        <small>{conversation.mailboxConnection?.emailAddress ?? 'Legacy mailbox'}</small>
      </span>
      <span className="mail-subject">
        <strong>{conversation.subject}</strong>
        <small>{preview(latest?.body ?? '')}</small>
      </span>
      <span className="shared-inbox-badges">
        <Badge tone={priorityTone(conversation.inboxPriority)}>
          {labelize(conversation.inboxPriority)}
        </Badge>
        <Badge tone={statusTone(conversation.inboxStatus)}>
          {labelize(conversation.inboxStatus)}
        </Badge>
      </span>
      <span className="shared-inbox-owner">
        {conversation.assignedUser ? personName(conversation.assignedUser) : 'Unassigned'}
        <small>
          {conversation.relatedEntityType ? labelize(conversation.relatedEntityType) : 'Unmatched'}
          {conversation._count.notes
            ? ` · ${conversation._count.notes} note${conversation._count.notes === 1 ? '' : 's'}`
            : ''}
        </small>
      </span>
      <span className="shared-inbox-time">
        <time>{formatDate(conversation.lastMessageAt)}</time>
        {conversation.dueAt ? (
          <small className={new Date(conversation.dueAt) < new Date() ? 'overdue-text' : ''}>
            <Clock3 aria-hidden="true" size={11} /> Due {formatDate(conversation.dueAt)}
          </small>
        ) : null}
      </span>
    </button>
  );
}

function preview(value: string) {
  return value.replace(/\s+/g, ' ').trim().slice(0, 110) || 'No preview';
}
function formatDate(value: string) {
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}
function personName(person: InboxUser) {
  return `${person.firstName} ${person.lastName}`.trim() || person.email;
}
function labelize(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase().replaceAll('_', ' ');
}
function priorityTone(priority: InboxConversationSummary['inboxPriority']) {
  return priority === 'URGENT' ? 'danger' : priority === 'HIGH' ? 'warning' : 'neutral';
}
function statusTone(status: InboxConversationSummary['inboxStatus']) {
  return status === 'RESOLVED' || status === 'CLOSED'
    ? 'success'
    : status === 'WAITING'
      ? 'warning'
      : 'neutral';
}
