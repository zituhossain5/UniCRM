'use client';

import { apiRequest } from '@/lib/api';
import type { ActivityRecord, ActivityRelatedType } from '@/lib/activity-types';
import {
  personName,
  type CompanyRecord,
  type ContactRecord,
  type DealRecord,
  type LeadRecord,
  type PersonRef,
} from '@/lib/crm-types';
import { Button, Input, Select, Sheet, Textarea } from '@unicrm/ui';
import { CalendarPlus } from 'lucide-react';
import { useEffect, useId, useMemo, useState, type FormEvent, type ReactElement } from 'react';

type Related = { type: ActivityRelatedType; id: string; name: string };
type ReferenceRecord = { id: string; name: string; type: ActivityRelatedType };

function localValue(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function ActivitySheet({
  activity,
  defaultType = 'CALL',
  onSaved,
  onOpenChange,
  open,
  related,
  trigger,
}: {
  activity?: ActivityRecord;
  defaultType?: 'CALL' | 'MEETING' | 'FOLLOW_UP' | 'OTHER';
  onSaved?: () => void;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  related?: Related;
  trigger: ReactElement;
}) {
  const [references, setReferences] = useState<ReferenceRecord[]>([]);
  const [users, setUsers] = useState<PersonRef[]>([]);
  const [relatedType, setRelatedType] = useState<ActivityRelatedType>(related?.type ?? 'LEAD');
  const [relatedId, setRelatedId] = useState(related?.id ?? '');
  const [type, setType] = useState<'CALL' | 'MEETING' | 'FOLLOW_UP' | 'OTHER'>(
    activity?.type === 'CALL' ||
      activity?.type === 'MEETING' ||
      activity?.type === 'FOLLOW_UP' ||
      activity?.type === 'OTHER'
      ? activity.type
      : defaultType,
  );
  const [ownerId, setOwnerId] = useState(activity?.ownerId ?? '');
  const [reminder, setReminder] = useState('30');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const formId = useId();

  useEffect(() => {
    if (!open && open !== undefined) return;
    void Promise.all([
      apiRequest<{ data: PersonRef[] }>('/users'),
      apiRequest<{ data: LeadRecord[] }>('/leads?limit=100&view=all'),
      apiRequest<{ data: DealRecord[] }>('/deals?limit=100'),
      apiRequest<{ data: ContactRecord[] }>('/contacts?limit=100'),
      apiRequest<{ data: CompanyRecord[] }>('/companies?limit=100'),
    ])
      .then(([userResult, leads, deals, contacts, companies]) => {
        setUsers(userResult.data.filter((user) => user.status === 'ACTIVE'));
        setReferences([
          ...leads.data.map((item) => ({ id: item.id, name: item.title, type: 'LEAD' as const })),
          ...deals.data.map((item) => ({ id: item.id, name: item.name, type: 'DEAL' as const })),
          ...contacts.data.map((item) => ({
            id: item.id,
            name: `${item.firstName} ${item.lastName}`,
            type: 'CONTACT' as const,
          })),
          ...companies.data.map((item) => ({
            id: item.id,
            name: item.name,
            type: 'COMPANY' as const,
          })),
        ]);
      })
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : 'Could not load activity options.'),
      );
  }, [open]);

  useEffect(() => {
    if (related) {
      setRelatedType(related.type);
      setRelatedId(related.id);
    }
  }, [related]);

  const relatedOptions = useMemo(
    () => references.filter((item) => item.type === relatedType),
    [references, relatedType],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const field = (name: string) => {
      const value = form.get(name);
      return typeof value === 'string' ? value : '';
    };
    const startAt = new Date(field('startAt'));
    const endAt = field('endAt') ? new Date(field('endAt')) : null;
    if (endAt && endAt < startAt) {
      setError('End must be after the activity start.');
      setSaving(false);
      return;
    }
    const reminderMinutes = Number(reminder);
    const payload = {
      type,
      subject: field('subject'),
      description: field('description'),
      relatedEntityType: relatedType,
      relatedEntityId: relatedId,
      ownerId: ownerId || undefined,
      startAt: startAt.toISOString(),
      endAt: endAt?.toISOString() ?? null,
      priority: field('priority'),
      reminderAt:
        reminder === ''
          ? null
          : new Date(startAt.getTime() - reminderMinutes * 60_000).toISOString(),
    };
    try {
      if (activity) {
        const update = {
          type: payload.type,
          subject: payload.subject,
          description: payload.description,
          ownerId: payload.ownerId,
          startAt: payload.startAt,
          endAt: payload.endAt,
          priority: payload.priority,
          reminderAt: payload.reminderAt,
        };
        await apiRequest(`/activities/${activity.id}`, {
          method: 'PATCH',
          body: JSON.stringify(update),
        });
      } else await apiRequest('/activities', { method: 'POST', body: JSON.stringify(payload) });
      onOpenChange?.(false);
      onSaved?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save activity.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      description={
        activity
          ? 'Update timing, ownership, and reminder.'
          : 'Schedule CRM work in the organization timezone.'
      }
      onOpenChange={onOpenChange}
      open={open}
      popupClassName="activity-sheet"
      title={
        activity
          ? 'Reschedule activity'
          : `Schedule ${type === 'FOLLOW_UP' ? 'follow-up' : type.toLowerCase()}`
      }
      trigger={trigger}
      footer={
        <>
          <Button disabled={saving} variant="secondary" onClick={() => onOpenChange?.(false)}>
            Cancel
          </Button>
          <Button disabled={saving || !relatedId} form={formId} type="submit">
            <CalendarPlus size={15} />
            {saving ? 'Saving…' : activity ? 'Save changes' : 'Schedule activity'}
          </Button>
        </>
      }
    >
      <form
        className="dialog-form activity-form"
        id={formId}
        onSubmit={(event) => void submit(event)}
      >
        <div className="activity-form-field">
          <Select
            label="Activity type"
            onValueChange={(value) => setType((value ?? 'CALL') as typeof type)}
            options={['CALL', 'MEETING', 'FOLLOW_UP', 'OTHER'].map((value) => ({
              label: value === 'FOLLOW_UP' ? 'Follow-up' : value[0] + value.slice(1).toLowerCase(),
              value,
            }))}
            value={type}
          />
        </div>
        <label>
          <span>Subject</span>
          <Input defaultValue={activity?.subject} maxLength={220} name="subject" required />
        </label>
        {!related ? (
          <div className="form-grid two-columns">
            <div className="activity-form-field">
              <Select
                label="Related record type"
                onValueChange={(value) => {
                  setRelatedType((value ?? 'LEAD') as ActivityRelatedType);
                  setRelatedId('');
                }}
                options={['LEAD', 'DEAL', 'CONTACT', 'COMPANY'].map((value) => ({
                  label: value[0] + value.slice(1).toLowerCase(),
                  value,
                }))}
                value={relatedType}
              />
            </div>
            <div className="activity-form-field">
              <Select
                label="Related record"
                onValueChange={(value) => setRelatedId(value ?? '')}
                options={[
                  { label: 'Select record', value: '' },
                  ...relatedOptions.map((item) => ({ label: item.name, value: item.id })),
                ]}
                value={relatedId}
              />
            </div>
          </div>
        ) : (
          <p className="activity-related-context">
            Related to <strong>{related.name}</strong>
          </p>
        )}
        <div className="activity-form-field">
          <Select
            label="Owner"
            onValueChange={(value) => setOwnerId(value ?? '')}
            options={[
              { label: 'Me', value: '' },
              ...users.map((user) => ({ label: personName(user), value: user.id })),
            ]}
            value={ownerId}
          />
        </div>
        <div className="form-grid two-columns">
          <label>
            <span>Start</span>
            <Input
              defaultValue={localValue(activity?.startAt)}
              name="startAt"
              required
              type="datetime-local"
            />
          </label>
          <label>
            <span>End (optional)</span>
            <Input defaultValue={localValue(activity?.endAt)} name="endAt" type="datetime-local" />
          </label>
        </div>
        <div className="form-grid two-columns">
          <div className="activity-form-field">
            <Select
              label="Priority"
              name="priority"
              defaultValue={activity?.priority ?? 'MEDIUM'}
              options={['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((value) => ({
                label: value[0] + value.slice(1).toLowerCase(),
                value,
              }))}
            />
          </div>
          <div className="activity-form-field">
            <Select
              label="Reminder"
              onValueChange={(value) => setReminder(value ?? '')}
              options={[
                { label: 'No reminder', value: '' },
                { label: '15 minutes before', value: '15' },
                { label: '30 minutes before', value: '30' },
                { label: '1 hour before', value: '60' },
                { label: '1 day before', value: '1440' },
              ]}
              value={reminder}
            />
          </div>
        </div>
        <label>
          <span>Description</span>
          <Textarea defaultValue={activity?.description ?? ''} name="description" rows={5} />
        </label>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </Sheet>
  );
}
