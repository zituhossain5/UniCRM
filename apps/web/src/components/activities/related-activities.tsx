'use client';

import { apiRequest } from '@/lib/api';
import type {
  ActivityListResponse,
  ActivityRecord,
  ActivityRelatedType,
} from '@/lib/activity-types';
import { labelize } from '@/lib/crm-types';
import { Badge } from '@unicrm/ui';
import { useCallback, useEffect, useState } from 'react';

export function RelatedActivities({
  entityId,
  entityType,
}: {
  entityId: string;
  entityType: ActivityRelatedType;
}) {
  const [upcoming, setUpcoming] = useState<ActivityRecord[]>([]);
  const [past, setPast] = useState<ActivityRecord[]>([]);
  const [timezone, setTimezone] = useState('UTC');
  const load = useCallback(async () => {
    const common = `relatedEntityType=${entityType}&relatedEntityId=${entityId}&limit=20`;
    const [future, history] = await Promise.all([
      apiRequest<ActivityListResponse>(`/activities?view=upcoming&${common}`),
      apiRequest<ActivityListResponse>(
        `/activities?view=all&order=desc&dateTo=${encodeURIComponent(new Date().toISOString())}&${common}`,
      ),
    ]);
    setUpcoming(future.data);
    setPast(history.data);
    setTimezone(future.meta.timezone);
  }, [entityId, entityType]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <section className="record-panel related-activities">
      <div>
        <h2>Upcoming Activities</h2>
        {upcoming.length ? (
          <ul>
            {upcoming.map((item) => (
              <li key={item.id}>
                <span>
                  <strong>{item.subject}</strong>
                  <small>
                    {new Intl.DateTimeFormat(undefined, {
                      timeZone: timezone,
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(new Date(item.startAt))}
                  </small>
                </span>
                <Badge tone="warning">{labelize(item.type)}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="record-empty">No upcoming activities.</p>
        )}
      </div>
      <div>
        <h2>Past Activities</h2>
        {past.length ? (
          <ul>
            {past.map((item) => (
              <li key={item.id}>
                <span>
                  <strong>{item.subject}</strong>
                  <small>
                    {new Intl.DateTimeFormat(undefined, {
                      timeZone: timezone,
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(new Date(item.completedAt ?? item.startAt))}
                  </small>
                </span>
                <Badge tone={item.status === 'COMPLETED' ? 'success' : 'neutral'}>
                  {labelize(item.status)}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="record-empty">No completed activities.</p>
        )}
      </div>
    </section>
  );
}
