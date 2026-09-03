'use client';

import { Button, EmptyState, LoadingState } from '@unicrm/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { KeyboardEvent } from 'react';
import { apiRequest } from '@/lib/api';
import type { NotificationItem } from '@/lib/operational-types';

const compactLimit = 12;

const target = (item: NotificationItem) =>
  item.entityType === 'LEAD'
    ? `/app/leads/${item.entityId}`
    : item.entityType === 'PROJECT'
      ? `/app/projects/${item.entityId}`
      : item.entityType === 'QUOTATION'
        ? `/app/quotations/${item.entityId}`
        : item.entityType === 'TASK'
          ? `/app/tasks?task=${item.entityId}`
          : item.entityType === 'PAYMENT'
            ? '/app/payments'
            : '/app/dashboard';
const ago = (value: string) => {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  return minutes < 1
    ? 'Just now'
    : minutes < 60
      ? `${minutes}m ago`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)}h ago`
        : `${Math.floor(minutes / 1440)}d ago`;
};

export function NotificationBellContent({
  compact = true,
  onActivate,
}: {
  compact?: boolean;
  onActivate?: () => void;
}) {
  const client = useQueryClient();
  const router = useRouter();
  const limit = compact ? compactLimit : 25;
  const list = useQuery({
    queryKey: ['notifications', limit],
    queryFn: () =>
      apiRequest<{ data: NotificationItem[]; meta: { total: number } }>(
        `/notifications?limit=${limit}`,
      ),
    refetchInterval: 60_000,
  });
  const mark = useMutation({
    mutationFn: (id: string) => apiRequest(`/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const all = useMutation({
    mutationFn: () => apiRequest('/notifications/read-all', { method: 'POST' }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const notifications = list.data?.data ?? [];
  const hasNotifications = notifications.length > 0;
  const hasUnread = notifications.some((item) => !item.readAt);
  const activate = (item: NotificationItem) => {
    onActivate?.();
    if (!item.readAt) mark.mutate(item.id);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLAnchorElement>, item: NotificationItem) => {
    if (event.key !== ' ') return;
    event.preventDefault();
    activate(item);
    router.push(target(item));
  };

  if (!compact && !list.isLoading && !hasNotifications)
    return <EmptyState description="You are all caught up." title="No notifications" />;

  return (
    <div className={`notification-center${compact ? ' notification-center--compact' : ''}`}>
      <header>
        <strong>Notifications</strong>
        {hasUnread ? (
          <Button onClick={() => all.mutate()} variant="ghost">
            Mark all read
          </Button>
        ) : null}
      </header>
      {list.isLoading ? (
        <div className="notification-loading">
          <LoadingState label="Loading notifications" />
        </div>
      ) : hasNotifications ? (
        <div className="notification-list">
          {notifications.map((item) => (
            <Link
              aria-label={`${item.readAt ? 'Read' : 'Unread'} notification: ${item.title}. ${item.message}`}
              className={`notification-row${item.readAt ? '' : ' notification-row--unread'}`}
              href={target(item)}
              key={item.id}
              onClick={() => activate(item)}
              onKeyDown={(event) => handleKeyDown(event, item)}
            >
              <span>
                <strong>{item.title}</strong>
                <small>{item.message}</small>
              </span>
              <time>{ago(item.createdAt)}</time>
              {!item.readAt ? (
                <span aria-label="Unread" className="notification-unread-dot" role="img" />
              ) : null}
            </Link>
          ))}
        </div>
      ) : (
        <div className="notification-empty-state">
          <div className="notification-empty-icon">
            <Bell aria-hidden="true" size={20} />
          </div>
          <strong>No notifications</strong>
          <p>You&apos;re all caught up.</p>
        </div>
      )}
      {compact && hasNotifications ? (
        <Link className="notification-all-link" href="/app/notifications">
          View all notifications
        </Link>
      ) : null}
    </div>
  );
}

export function UnreadBadge() {
  const query = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => apiRequest<{ data: { count: number } }>('/notifications/unread-count'),
    refetchInterval: 60_000,
  });
  return query.data?.data.count ? (
    <span className="notification-badge">{Math.min(query.data.data.count, 99)}</span>
  ) : null;
}
