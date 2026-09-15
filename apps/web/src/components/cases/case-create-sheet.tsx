'use client';

import { apiRequest } from '@/lib/api';
import { casePriorities, caseTypes, caseLabel, type CustomerCase } from '@/lib/case-types';
import { useCrmReferenceData, userOptions } from '@/lib/crm-reference-data';
import { Button, Input, Select, Sheet, Textarea } from '@unicrm/ui';
import { useEffect, useState, type FormEvent, type ReactElement } from 'react';
import { useCurrentUser } from '../auth-provider';

type Option = { id: string; name?: string; title?: string; firstName?: string; lastName?: string };
type InitialCase = Partial<
  Pick<
    CustomerCase,
    'title' | 'description' | 'contactId' | 'companyId' | 'leadId' | 'dealId' | 'sourceThreadId'
  >
>;

export function CaseCreateSheet({
  open,
  onOpenChange,
  onCreated,
  trigger,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (record: CustomerCase) => void;
  trigger: ReactElement;
  initial?: InitialCase;
}) {
  const current = useCurrentUser();
  const { users } = useCrmReferenceData({ users: current.permissions.includes('user.read') });
  const [references, setReferences] = useState<{
    companies: Option[];
    contacts: Option[];
    leads: Option[];
    deals: Option[];
  }>({ companies: [], contacts: [], leads: [], deals: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    void Promise.all([
      apiRequest<{ data: Option[] }>('/companies?limit=100'),
      apiRequest<{ data: Option[] }>('/contacts?limit=100'),
      apiRequest<{ data: Option[] }>('/leads?limit=100'),
      apiRequest<{ data: Option[] }>('/deals?limit=100&view=all'),
    ])
      .then(([companies, contacts, leads, deals]) =>
        setReferences({
          companies: companies.data,
          contacts: contacts.data,
          leads: leads.data,
          deals: deals.data,
        }),
      )
      .catch(() => undefined);
  }, [open]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = event.currentTarget;
    const payload = Object.fromEntries(
      [...new FormData(form).entries()].filter(([, value]) => value !== ''),
    );
    try {
      const result = await apiRequest<{ data: CustomerCase }>('/cases', {
        method: 'POST',
        body: JSON.stringify({ ...payload, sourceThreadId: initial?.sourceThreadId }),
      });
      form.reset();
      onCreated?.(result.data);
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create case.');
    } finally {
      setBusy(false);
    }
  }

  const option = (item: Option) => ({
    value: item.id,
    label: item.name ?? item.title ?? `${item.firstName ?? ''} ${item.lastName ?? ''}`.trim(),
  });
  return (
    <Sheet
      title="Create case"
      description="Review the customer issue and link the relevant CRM records."
      open={open}
      onOpenChange={onOpenChange}
      trigger={trigger}
    >
      <form className="form-stack" onSubmit={(event) => void submit(event)}>
        <label>
          Title
          <Input name="title" defaultValue={initial?.title ?? ''} maxLength={220} required />
        </label>
        <label>
          Description
          <Textarea name="description" defaultValue={initial?.description ?? ''} rows={5} />
        </label>
        <div className="form-grid-2">
          <label>
            Type
            <Select
              name="type"
              defaultValue="GENERAL_INQUIRY"
              options={caseTypes.map((value) => ({ value, label: caseLabel(value) }))}
            />
          </label>
          <label>
            Priority
            <Select
              name="priority"
              defaultValue="NORMAL"
              options={casePriorities.map((value) => ({ value, label: caseLabel(value) }))}
            />
          </label>
        </div>
        <label>
          Assignee
          <Select
            name="assignedUserId"
            options={[{ value: '', label: 'Unassigned' }, ...userOptions(users)]}
          />
        </label>
        <label>
          Contact
          <Select
            name="contactId"
            defaultValue={initial?.contactId ?? ''}
            options={[{ value: '', label: 'No contact' }, ...references.contacts.map(option)]}
          />
        </label>
        <label>
          Company
          <Select
            name="companyId"
            defaultValue={initial?.companyId ?? ''}
            options={[{ value: '', label: 'No company' }, ...references.companies.map(option)]}
          />
        </label>
        <label>
          Lead
          <Select
            name="leadId"
            defaultValue={initial?.leadId ?? ''}
            options={[{ value: '', label: 'No lead' }, ...references.leads.map(option)]}
          />
        </label>
        <label>
          Deal
          <Select
            name="dealId"
            defaultValue={initial?.dealId ?? ''}
            options={[{ value: '', label: 'No deal' }, ...references.deals.map(option)]}
          />
        </label>
        <label>
          Due date
          <Input name="dueAt" type="datetime-local" />
        </label>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <Button disabled={busy} loading={busy} type="submit">
          Create case
        </Button>
      </form>
    </Sheet>
  );
}
