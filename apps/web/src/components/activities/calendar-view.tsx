'use client';

import { useCurrentUser } from '@/components/auth-provider';
import { apiRequest } from '@/lib/api';
import type { ActivityListResponse, ActivityRecord } from '@/lib/activity-types';
import { Button, IconButton, PageHeader } from '@unicrm/ui';
import { addDays, format, getDay, parse, startOfWeek } from 'date-fns';
import { enUS } from 'date-fns/locale';
import {
  Calendar as BigCalendar,
  dateFnsLocalizer,
  type EventProps,
  type ToolbarProps,
  type View,
} from 'react-big-calendar';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ListTodo,
  Phone,
  Video,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivitySheet } from './activity-sheet';

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales: { 'en-US': enUS },
});
type ActivityEvent = {
  allDay: boolean;
  end: Date;
  resource: ActivityRecord;
  start: Date;
  title: string;
};

const calendarViews: Array<{ label: string; value: View }> = [
  { label: 'Month', value: 'month' },
  { label: 'Week', value: 'week' },
  { label: 'Day', value: 'day' },
  { label: 'Agenda', value: 'agenda' },
];

function CalendarToolbar({ label, onNavigate, onView, view }: ToolbarProps<ActivityEvent>) {
  return (
    <div className="calendar-toolbar">
      <div className="calendar-toolbar-group" aria-label="Calendar navigation" role="group">
        <Button variant="secondary" onClick={() => onNavigate('TODAY')}>
          Today
        </Button>
        <IconButton label="Previous period" variant="outline" onClick={() => onNavigate('PREV')}>
          <ChevronLeft aria-hidden="true" size={16} />
        </IconButton>
        <IconButton label="Next period" variant="outline" onClick={() => onNavigate('NEXT')}>
          <ChevronRight aria-hidden="true" size={16} />
        </IconButton>
      </div>
      <strong className="calendar-toolbar-label" aria-live="polite">
        {label}
      </strong>
      <div className="calendar-view-switch" aria-label="Calendar view" role="group">
        {calendarViews.map((option) => (
          <Button
            aria-pressed={view === option.value}
            className={view === option.value ? 'is-active' : undefined}
            key={option.value}
            onClick={() => onView(option.value)}
            variant="secondary"
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

function CalendarEventContent({ event }: EventProps<ActivityEvent>) {
  const activity = event.resource;
  const icon =
    activity.type === 'CALL' ? (
      <Phone aria-hidden="true" size={12} />
    ) : activity.type === 'MEETING' ? (
      <Video aria-hidden="true" size={12} />
    ) : activity.type === 'FOLLOW_UP' ? (
      <Clock3 aria-hidden="true" size={12} />
    ) : activity.type === 'TASK' ? (
      <ListTodo aria-hidden="true" size={12} />
    ) : (
      <CalendarDays aria-hidden="true" size={12} />
    );
  const showTime = activity.source !== 'TASK' && activity.source !== 'PROJECT_DEADLINE';
  const time = event.start && showTime ? format(event.start, 'p') : '';
  const title = `${time ? `${time} · ` : ''}${activity.subject}`;
  return (
    <span className="calendar-event-content" title={title}>
      {icon}
      {time ? <time>{time}</time> : null}
      <span>{activity.subject}</span>
    </span>
  );
}

function zonedDisplayDate(value: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );
}

export function CalendarView() {
  const current = useCurrentUser();
  const [data, setData] = useState<ActivityRecord[]>([]);
  const [timezone, setTimezone] = useState('');
  const [view, setView] = useState<View>('month');
  const [date, setDate] = useState(new Date());
  const [createType, setCreateType] = useState<'CALL' | 'MEETING' | 'FOLLOW_UP' | 'OTHER'>();
  const [selected, setSelected] = useState<ActivityRecord>();
  const load = useCallback(async () => {
    const from = addDays(date, -45).toISOString();
    const to = addDays(date, 45).toISOString();
    const result = await apiRequest<ActivityListResponse>(
      `/activities?view=all&limit=100&dateFrom=${encodeURIComponent(from)}&dateTo=${encodeURIComponent(to)}`,
    );
    setData(result.data);
    setTimezone(result.meta.timezone);
  }, [date]);
  useEffect(() => {
    void load();
  }, [load]);
  const events = useMemo<ActivityEvent[]>(
    () =>
      data.map((item) => ({
        title: item.subject,
        start: zonedDisplayDate(item.startAt, timezone || 'UTC'),
        end: item.endAt
          ? zonedDisplayDate(item.endAt, timezone || 'UTC')
          : zonedDisplayDate(item.startAt, timezone || 'UTC'),
        allDay: item.source === 'TASK' || item.source === 'PROJECT_DEADLINE',
        resource: item,
      })),
    [data, timezone],
  );
  return (
    <div className="crm-page calendar-page">
      <PageHeader
        title="Calendar"
        description={timezone ? `Scheduled CRM work · ${timezone}` : 'Scheduled CRM work'}
        actions={
          <div className="activity-header-actions">
            <Button variant="secondary" onClick={() => window.location.assign('/app/activities')}>
              <ListTodo size={15} />
              Activities
            </Button>
            {current.permissions.includes('activity.create') ? (
              <>
                <Button variant="secondary" onClick={() => setCreateType('CALL')}>
                  <Phone aria-hidden="true" size={15} /> Call
                </Button>
                <Button variant="secondary" onClick={() => setCreateType('MEETING')}>
                  <Video aria-hidden="true" size={15} /> Meeting
                </Button>
                <Button variant="secondary" onClick={() => setCreateType('FOLLOW_UP')}>
                  <Clock3 aria-hidden="true" size={15} /> Follow-up
                </Button>
              </>
            ) : null}
          </div>
        }
      />
      <div className="calendar-shell">
        <BigCalendar<ActivityEvent>
          components={{ event: CalendarEventContent, toolbar: CalendarToolbar }}
          date={date}
          eventPropGetter={(event) => ({
            className: `calendar-event calendar-event--${event.resource.type.toLowerCase().replace('_', '-')}`,
          })}
          events={events}
          localizer={localizer}
          onNavigate={setDate}
          onSelectEvent={(event) => {
            const activity = event.resource;
            if (activity.source === 'SCHEDULED_ACTIVITY') setSelected(activity);
            else if (activity.source === 'TASK')
              window.location.assign(`/app/tasks?task=${activity.id}`);
            else if (activity.source === 'PROJECT_DEADLINE')
              window.location.assign(`/app/projects/${activity.id}`);
            else window.location.assign(`/app/leads/${activity.relatedEntityId}`);
          }}
          onView={setView}
          popup
          step={30}
          style={{ height: 680 }}
          view={view}
          views={['month', 'week', 'day', 'agenda']}
        />
      </div>
      {createType ? (
        <ActivitySheet
          defaultType={createType}
          onOpenChange={(open) => {
            if (!open) setCreateType(undefined);
          }}
          onSaved={() => void load()}
          open
          trigger={
            <button className="visually-hidden" type="button">
              Schedule
            </button>
          }
        />
      ) : null}
      {selected?.source === 'SCHEDULED_ACTIVITY' ? (
        <ActivitySheet
          activity={selected}
          onOpenChange={(open) => {
            if (!open) setSelected(undefined);
          }}
          onSaved={() => void load()}
          open
          related={{
            type: selected.relatedEntityType as never,
            id: selected.relatedEntityId!,
            name: selected.relatedRecord?.name ?? selected.relatedEntityType ?? 'CRM record',
          }}
          trigger={
            <button className="visually-hidden" type="button">
              Activity
            </button>
          }
        />
      ) : null}
    </div>
  );
}
