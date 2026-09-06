'use client';

import { AuthMessage } from '@/components/auth-screen';
import { useCurrentUser } from '@/components/auth-provider';
import { apiRequest } from '@/lib/api';
import { emitCrmDataChanged } from '@/lib/crm-events';
import {
  AdditionalInformationFields,
  configurableRecordPayload,
  useRecordConfiguration,
} from '@/components/configuration/record-configuration';
import type { CustomFieldDefinition, Tag } from '@/lib/configuration-types';
import {
  companyStatuses,
  labelize,
  leadPriorities,
  leadSources,
  type CompanyRecord,
  type ContactRecord,
  type PersonRef,
  type Pipeline,
} from '@/lib/crm-types';
import { useCrmReferenceData, userOptions } from '@/lib/crm-reference-data';
import { Button, Input, Select, Sheet, Textarea } from '@unicrm/ui';
import { useEffect, useId, useMemo, useState, type FormEvent, type ReactElement } from 'react';

interface CreateSheetProps {
  onCreated?: () => Promise<void> | void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  trigger: ReactElement;
}

export function CompanyCreateSheet({ onCreated, onOpenChange, open, trigger }: CreateSheetProps) {
  const current = useCurrentUser();
  const formId = useStableFormId('create-company-form');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formKey, setFormKey] = useState(0);
  const canReadUsers = current.permissions.includes('user.read');
  const { error: referenceError, loading, users } = useCrmReferenceData({ users: canReadUsers });
  const configuration = useRecordConfiguration('COMPANY');

  useEffect(() => {
    if (open) setFormKey((key) => key + 1);
    else setError('');
  }, [open]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const payload = configurableRecordPayload(event.currentTarget, configuration.definitions);
    try {
      await apiRequest('/companies', { method: 'POST', body: JSON.stringify(payload) });
      emitCrmDataChanged(['companies']);
      onOpenChange(false);
      await onCreated?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Company creation failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="New company"
      description="Start with the details your team needs now."
      footer={
        <>
          <Button
            disabled={saving}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="secondary"
          >
            Cancel
          </Button>
          <Button form={formId} loading={saving} type="submit">
            Create company
          </Button>
        </>
      }
      trigger={trigger}
    >
      <FormNotice error={error || referenceError} loading={loading && canReadUsers} />
      <CompanyForm
        formId={formId}
        formKey={formKey}
        key={formKey}
        onSubmit={(event) => void create(event)}
        users={users}
        definitions={configuration.definitions}
        tags={configuration.tags}
      />
    </Sheet>
  );
}

export function ContactCreateSheet({ onCreated, onOpenChange, open, trigger }: CreateSheetProps) {
  const formId = useStableFormId('create-contact-form');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formKey, setFormKey] = useState(0);
  const { companies, error: referenceError, loading } = useCrmReferenceData({ companies: true });
  const configuration = useRecordConfiguration('CONTACT');

  useEffect(() => {
    if (open) setFormKey((key) => key + 1);
    else setError('');
  }, [open]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const payload = configurableRecordPayload(event.currentTarget, configuration.definitions);
    try {
      await apiRequest('/contacts', {
        method: 'POST',
        body: JSON.stringify({ ...payload, isPrimary: form.get('isPrimary') === 'on' }),
      });
      emitCrmDataChanged(['contacts', 'companies']);
      onOpenChange(false);
      await onCreated?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Contact creation failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="New contact"
      description="A contact may be linked to a company now or later."
      footer={
        <>
          <Button
            disabled={saving}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="secondary"
          >
            Cancel
          </Button>
          <Button form={formId} loading={saving} type="submit">
            Create contact
          </Button>
        </>
      }
      trigger={trigger}
    >
      <FormNotice error={error || referenceError} loading={loading} />
      <ContactForm
        companies={companies}
        formId={formId}
        formKey={formKey}
        key={formKey}
        onSubmit={(event) => void create(event)}
        definitions={configuration.definitions}
        tags={configuration.tags}
      />
    </Sheet>
  );
}

export function LeadCreateSheet({ onCreated, onOpenChange, open, trigger }: CreateSheetProps) {
  const current = useCurrentUser();
  const formId = useStableFormId('create-lead-form');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formKey, setFormKey] = useState(0);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const canReadUsers = current.permissions.includes('user.read');
  const canAssignLead = current.permissions.includes('lead.assign');
  const {
    companies,
    contacts,
    error: referenceError,
    loading,
    users,
  } = useCrmReferenceData({ companies: true, contacts: true, users: canReadUsers });
  const configuration = useRecordConfiguration('LEAD');

  useEffect(() => {
    if (open) setFormKey((key) => key + 1);
    else setError('');
  }, [open]);
  useEffect(() => {
    void apiRequest<{ data: Pipeline[] }>('/pipelines')
      .then((result) => setPipelines(result.data))
      .catch(() => undefined);
  }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const payload = configurableRecordPayload(event.currentTarget, configuration.definitions);
    try {
      await apiRequest('/leads', { method: 'POST', body: JSON.stringify(payload) });
      emitCrmDataChanged(['leads', 'companies']);
      onOpenChange(false);
      await onCreated?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Lead creation failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="New lead"
      description="Capture the opportunity now; enrich it as the relationship develops."
      footer={
        <>
          <Button
            disabled={saving}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="secondary"
          >
            Cancel
          </Button>
          <Button form={formId} loading={saving} type="submit">
            Create lead
          </Button>
        </>
      }
      trigger={trigger}
    >
      <FormNotice error={error || referenceError} loading={loading} />
      <LeadForm
        canAssignLead={canAssignLead}
        companies={companies}
        contacts={contacts}
        formId={formId}
        formKey={formKey}
        key={formKey}
        onSubmit={(event) => void create(event)}
        users={users}
        definitions={configuration.definitions}
        tags={configuration.tags}
        pipelines={pipelines}
      />
    </Sheet>
  );
}

function CompanyForm({
  definitions,
  formId,
  formKey,
  onSubmit,
  users,
  tags,
}: {
  definitions: CustomFieldDefinition[];
  formId: string;
  formKey: number;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  users: PersonRef[];
  tags: Tag[];
}) {
  return (
    <form className="dialog-form" id={formId} key={formKey} onSubmit={onSubmit}>
      <label>
        <span>Company name</span>
        <Input name="name" required maxLength={150} />
      </label>
      <label>
        <span>Website</span>
        <Input name="website" type="url" placeholder="https://example.com" />
      </label>
      <div className="form-two-columns">
        <label>
          <span>Email</span>
          <Input name="email" type="email" />
        </label>
        <label>
          <span>Phone</span>
          <Input name="phone" />
        </label>
      </div>
      <Select
        label="Status"
        name="status"
        defaultValue="PROSPECT"
        options={companyStatuses.filter((status) => status.value !== 'ARCHIVED')}
      />
      {users.length ? (
        <Select
          label="Account owner"
          name="accountOwnerId"
          options={userOptions(users)}
          placeholder="Unassigned"
        />
      ) : null}
      <AdditionalInformationFields definitions={definitions} tags={tags} />
    </form>
  );
}

function ContactForm({
  companies,
  formId,
  formKey,
  onSubmit,
  definitions,
  tags,
}: {
  companies: CompanyRecord[];
  formId: string;
  formKey: number;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  definitions: CustomFieldDefinition[];
  tags: Tag[];
}) {
  return (
    <form className="dialog-form" id={formId} key={formKey} onSubmit={onSubmit}>
      <div className="form-two-columns">
        <label>
          <span>First name</span>
          <Input name="firstName" required />
        </label>
        <label>
          <span>Last name</span>
          <Input name="lastName" required />
        </label>
      </div>
      <Select
        label="Company"
        name="companyId"
        options={[
          { label: 'No company', value: '' },
          ...companies.map((company) => ({ label: company.name, value: company.id })),
        ]}
      />
      <label>
        <span>Job title</span>
        <Input name="jobTitle" />
      </label>
      <div className="form-two-columns">
        <label>
          <span>Email</span>
          <Input name="email" type="email" />
        </label>
        <label>
          <span>Phone</span>
          <Input name="phone" />
        </label>
      </div>
      <label className="native-check">
        <input name="isPrimary" type="checkbox" />
        <span>Primary contact for company</span>
      </label>
      <AdditionalInformationFields definitions={definitions} tags={tags} />
    </form>
  );
}

function LeadForm({
  canAssignLead,
  companies,
  contacts,
  formId,
  formKey,
  onSubmit,
  users,
  definitions,
  tags,
  pipelines,
}: {
  canAssignLead: boolean;
  companies: CompanyRecord[];
  contacts: ContactRecord[];
  formId: string;
  formKey: number;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  users: PersonRef[];
  definitions: CustomFieldDefinition[];
  tags: Tag[];
  pipelines: Pipeline[];
}) {
  const [companyId, setCompanyId] = useState('');
  const [contactId, setContactId] = useState('');
  const [pipelineId, setPipelineId] = useState('');
  const [stageId, setStageId] = useState('');
  const availableContacts = useMemo(
    () => (companyId ? contacts.filter((contact) => contact.company?.id === companyId) : contacts),
    [companyId, contacts],
  );

  useEffect(() => {
    if (contactId && !availableContacts.some((contact) => contact.id === contactId))
      setContactId('');
  }, [availableContacts, contactId]);
  useEffect(() => {
    if (!pipelineId && pipelines.length) {
      const pipeline = pipelines.find((item) => item.isDefault) ?? pipelines[0]!;
      setPipelineId(pipeline.id);
      setStageId(pipeline.stages[0]?.id ?? '');
    }
  }, [pipelineId, pipelines]);
  const pipelineStages = pipelines.find((pipeline) => pipeline.id === pipelineId)?.stages ?? [];

  return (
    <form className="dialog-form" id={formId} key={formKey} onSubmit={onSubmit}>
      <label>
        <span>Lead title</span>
        <Input name="title" required placeholder="Website redesign for ABC" />
      </label>
      <div className="form-two-columns">
        <Select
          label="Pipeline"
          name="pipelineId"
          value={pipelineId || null}
          onValueChange={(value) => {
            const next = value ?? '';
            setPipelineId(next);
            setStageId(pipelines.find((pipeline) => pipeline.id === next)?.stages[0]?.id ?? '');
          }}
          options={pipelines.map((pipeline) => ({ label: pipeline.name, value: pipeline.id }))}
        />
        <Select
          label="Stage"
          name="stageId"
          value={stageId || null}
          onValueChange={(value) => setStageId(value ?? '')}
          options={pipelineStages.map((stage) => ({ label: stage.name, value: stage.id }))}
        />
      </div>
      <div className="form-two-columns">
        <label>
          <span>First name</span>
          <Input name="firstName" />
        </label>
        <label>
          <span>Last name</span>
          <Input name="lastName" />
        </label>
      </div>
      <Select
        label="Company"
        name="companyId"
        onValueChange={(value) => setCompanyId(value ?? '')}
        options={[
          { label: 'No company', value: '' },
          ...companies.map((company) => ({ label: company.name, value: company.id })),
        ]}
        value={companyId}
      />
      <Select
        label="Contact"
        name="contactId"
        onValueChange={(value) => setContactId(value ?? '')}
        options={[
          { label: 'No contact', value: '' },
          ...availableContacts.map((contact) => ({
            label: `${contact.firstName} ${contact.lastName}`,
            value: contact.id,
          })),
        ]}
        value={contactId}
      />
      <div className="form-two-columns">
        <label>
          <span>Email</span>
          <Input name="email" type="email" />
        </label>
        <label>
          <span>Phone</span>
          <Input name="phone" />
        </label>
      </div>
      <div className="form-two-columns">
        <Select
          label="Source"
          name="source"
          options={leadSources.map((source) => ({ label: labelize(source), value: source }))}
          placeholder="Choose source"
        />
        <Select
          label="Priority"
          name="priority"
          defaultValue="MEDIUM"
          options={leadPriorities.map((priority) => ({
            label: labelize(priority),
            value: priority,
          }))}
        />
      </div>
      <div className="form-two-columns">
        <label>
          <span>Estimated value</span>
          <Input name="estimatedValue" type="number" min="0" step="0.01" />
        </label>
        <label>
          <span>Currency</span>
          <Input name="currency" defaultValue="BDT" maxLength={3} />
        </label>
      </div>
      {canAssignLead && users.length ? (
        <Select
          label="Owner"
          name="ownerId"
          options={userOptions(users)}
          placeholder="Unassigned"
        />
      ) : null}
      <label>
        <span>Next follow-up</span>
        <Input name="nextFollowUpAt" type="datetime-local" />
      </label>
      <AdditionalInformationFields definitions={definitions} tags={tags} />
      <label>
        <span>Notes</span>
        <Textarea name="notes" />
      </label>
    </form>
  );
}

function FormNotice({ error, loading }: { error: string; loading: boolean }) {
  if (error) return <AuthMessage>{error}</AuthMessage>;
  if (loading) return <p className="form-helper">Loading options...</p>;
  return null;
}

function useStableFormId(prefix: string) {
  return `${prefix}-${useId().replaceAll(':', '')}`;
}
