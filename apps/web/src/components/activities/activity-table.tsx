'use client';

import type { ActivityRecord } from '@/lib/activity-types';
import { labelize, personName } from '@/lib/crm-types';
import { Avatar, Badge } from '@unicrm/ui';
import { CalendarDays, Clock3, ListTodo, Phone, Video } from 'lucide-react';
import Link from 'next/link';
import type { KeyboardEvent, ReactNode } from 'react';

const typeLabels: Record<ActivityRecord['type'], string> = {
  CALL: 'Call',
  MEETING: 'Meeting',
  FOLLOW_UP: 'Follow-up',
  TASK: 'Task',
  PROJECT_DEADLINE: 'Project deadline',
  OTHER: 'Other',
};

const typeIcons: Record<ActivityRecord['type'], ReactNode> = {
  CALL: <Phone aria-hidden="true" size={14} />,
  MEETING: <Video aria-hidden="true" size={14} />,
  FOLLOW_UP: <Clock3 aria-hidden="true" size={14} />,
  TASK: <ListTodo aria-hidden="true" size={14} />,
  PROJECT_DEADLINE: <CalendarDays aria-hidden="true" size={14} />,
  OTHER: <CalendarDays aria-hidden="true" size={14} />,
};

function zonedDateParts(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'numeric',
    timeZone,
    year: 'numeric',
  }).formatToParts(value);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return { day: read('day'), month: read('month'), year: read('year') };
}

export function formatActivityWhen(item: ActivityRecord, timeZone: string, now = new Date()) {
  const value = new Date(item.startAt);
  if (Number.isNaN(value.getTime())) return '—';

  const target = zonedDateParts(value, timeZone);
  const today = zonedDateParts(now, timeZone);
  const targetDay = Date.UTC(target.year, target.month - 1, target.day) / 86_400_000;
  const todayDay = Date.UTC(today.year, today.month - 1, today.day) / 86_400_000;
  const dayDifference = targetDay - todayDay;
  const dayLabel =
    dayDifference === 0
      ? 'Today'
      : dayDifference === 1
        ? 'Tomorrow'
        : new Intl.DateTimeFormat(undefined, {
            day: 'numeric',
            month: 'short',
            timeZone,
            ...(target.year !== today.year ? { year: 'numeric' } : {}),
          }).format(value);

  if (item.source === 'PROJECT_DEADLINE') return dayLabel;

  const time = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(value);
  return `${dayLabel} · ${time}`;
}

function relatedHref(item: ActivityRecord, permissions: readonly string[]) {
  if (!item.relatedEntityId) return undefined;
  const destinations: Record<string, { href: string; permission: string }> = {
    COMPANY: { href: `/app/companies/${item.relatedEntityId}`, permission: 'company.read' },
    CONTACT: { href: `/app/contacts/${item.relatedEntityId}`, permission: 'contact.read' },
    DEAL: { href: `/app/deals/${item.relatedEntityId}`, permission: 'deal.read' },
    LEAD: { href: `/app/leads/${item.relatedEntityId}`, permission: 'lead.read' },
    PROJECT: { href: `/app/projects/${item.relatedEntityId}`, permission: 'project.read' },
  };
  const destination = destinations[item.relatedEntityType ?? ''];
  return destination && permissions.includes(destination.permission) ? destination.href : undefined;
}

function ownerInitials(item: ActivityRecord) {
  if (!item.owner) return '—';
  return `${item.owner.firstName[0] ?? ''}${item.owner.lastName[0] ?? ''}`.toUpperCase();
}

function ActivityStatus({ item, overdue }: { item: ActivityRecord; overdue: boolean }) {
  const label = overdue && item.status === 'PLANNED' ? 'Overdue' : labelize(item.status);
  const tone =
    item.status === 'COMPLETED'
      ? 'success'
      : item.status === 'CANCELLED'
        ? 'neutral'
        : overdue
          ? 'danger'
          : 'warning';
  return <Badge tone={tone}>{label}</Badge>;
}

function RelatedRecord({ href, item }: { href?: string; item: ActivityRecord }) {
  const name =
    item.relatedRecord?.name ?? (item.relatedEntityType ? labelize(item.relatedEntityType) : '—');
  if (!href) {
    return (
      <span className="activity-related-name" title={name}>
        {name}
      </span>
    );
  }
  return (
    <Link
      className="activity-related-link activity-related-name"
      href={href}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      title={name}
    >
      {name}
    </Link>
  );
}

function activateFromKeyboard(event: KeyboardEvent, activate: () => void) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  activate();
}

export function ActivityTable({
  activities,
  onActivate,
  permissions,
  timeZone,
  view,
}: {
  activities: ActivityRecord[];
  onActivate: (activity: ActivityRecord) => void;
  permissions: readonly string[];
  timeZone: string;
  view: string;
}) {
  return (
    <div className="activity-list">
      <div
        className="activity-table-shell"
        role="region"
        aria-label="Activities table"
        tabIndex={0}
      >
        <table className="activity-table">
          <colgroup>
            <col className="activity-column-main" />
            <col className="activity-column-type" />
            <col className="activity-column-when" />
            <col className="activity-column-related" />
            <col className="activity-column-owner" />
            <col className="activity-column-status" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Activity</th>
              <th scope="col">Type</th>
              <th scope="col">When</th>
              <th scope="col">Related</th>
              <th scope="col">Owner</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {activities.map((item) => {
              const owner = item.owner ? personName(item.owner) : 'Unassigned';
              const href = relatedHref(item, permissions);
              const when = formatActivityWhen(item, timeZone);
              return (
                <tr
                  className="activity-table-row"
                  key={`${item.source}:${item.id}`}
                  onClick={() => onActivate(item)}
                  onKeyDown={(event) => activateFromKeyboard(event, () => onActivate(item))}
                  tabIndex={0}
                >
                  <td>
                    <span className="activity-title" title={item.subject}>
                      {item.subject}
                    </span>
                    {item.description ? (
                      <span className="activity-description" title={item.description}>
                        {item.description}
                      </span>
                    ) : null}
                  </td>
                  <td>
                    <span className="activity-type-label" title={typeLabels[item.type]}>
                      {typeIcons[item.type]}
                      {typeLabels[item.type]}
                    </span>
                  </td>
                  <td>
                    <span className="activity-when" title={when}>
                      {when}
                    </span>
                  </td>
                  <td>
                    <RelatedRecord href={href} item={item} />
                  </td>
                  <td>
                    <span className="activity-owner" title={owner}>
                      <Avatar fallback={ownerInitials(item)} label={owner} size="sm" />
                      <span>{owner}</span>
                    </span>
                  </td>
                  <td>
                    <ActivityStatus item={item} overdue={view === 'overdue'} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="activity-mobile-list" aria-label="Activities">
        {activities.map((item) => {
          const owner = item.owner ? personName(item.owner) : 'Unassigned';
          const href = relatedHref(item, permissions);
          const when = formatActivityWhen(item, timeZone);
          return (
            <article
              className="activity-mobile-row"
              key={`${item.source}:${item.id}`}
              onClick={() => onActivate(item)}
              onKeyDown={(event) => activateFromKeyboard(event, () => onActivate(item))}
              role="button"
              tabIndex={0}
            >
              <span className="activity-title" title={item.subject}>
                {item.subject}
              </span>
              {item.description ? (
                <span className="activity-description" title={item.description}>
                  {item.description}
                </span>
              ) : null}
              <span className="activity-mobile-meta">
                <span className="activity-type-label" title={typeLabels[item.type]}>
                  {typeIcons[item.type]}
                  {typeLabels[item.type]}
                </span>
                <span aria-hidden="true">·</span>
                <span>{when}</span>
              </span>
              <RelatedRecord href={href} item={item} />
              <span className="activity-mobile-footer">
                <span className="activity-owner" title={owner}>
                  <Avatar fallback={ownerInitials(item)} label={owner} size="sm" />
                  <span>{owner}</span>
                </span>
                <ActivityStatus item={item} overdue={view === 'overdue'} />
              </span>
            </article>
          );
        })}
      </div>
    </div>
  );
}
