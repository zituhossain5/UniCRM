'use client';

import { AuthMessage } from '@/components/auth-screen';
import {
  AdditionalInformationFields,
  configurableRecordPayload,
  useRecordConfiguration,
} from '@/components/configuration/record-configuration';
import { useCurrentUser } from '@/components/auth-provider';
import { apiRequest } from '@/lib/api';
import { emitCrmDataChanged } from '@/lib/crm-events';
import { labelize, personName } from '@/lib/crm-types';
import { useWorkReferenceData } from '@/lib/work-reference-data';
import {
  projectStatuses,
  taskStatuses,
  workPriorities,
  type ProjectRecord,
  type TaskRecord,
} from '@/lib/work-types';
import { Button, Input, Select, Sheet, Textarea } from '@unicrm/ui';
import { useEffect, useId, useState, type FormEvent, type ReactElement } from 'react';

interface BaseProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  trigger: ReactElement;
}

export interface ProjectPrefill {
  companyId?: string;
  currency?: string;
  name?: string;
  projectValue?: string | null;
  sourceLeadId?: string;
}

export function ProjectCreateSheet({
  initial,
  onCreated,
  onOpenChange,
  open,
  trigger,
}: BaseProps & {
  initial?: ProjectPrefill;
  onCreated?: (project: ProjectRecord) => Promise<void> | void;
}) {
  const formId = useFormId('create-project');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formKey, setFormKey] = useState(0);
  const references = useWorkReferenceData();
  const configuration = useRecordConfiguration('PROJECT');
  useEffect(() => {
    if (open) setFormKey((value) => value + 1);
    else setError('');
  }, [open]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const result = await apiRequest<{ data: ProjectRecord }>('/projects', {
        method: 'POST',
        body: JSON.stringify(
          configurableRecordPayload(event.currentTarget, configuration.definitions),
        ),
      });
      emitCrmDataChanged(['projects', 'companies', 'leads']);
      onOpenChange(false);
      await onCreated?.(result.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Project creation failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      description="Connect a client engagement to delivery work."
      footer={
        <>
          <Button disabled={saving} onClick={() => onOpenChange(false)} variant="secondary">
            Cancel
          </Button>
          <Button form={formId} loading={saving} type="submit">
            Create project
          </Button>
        </>
      }
      onOpenChange={onOpenChange}
      open={open}
      title="New project"
      trigger={trigger}
    >
      {error || references.error ? <AuthMessage>{error || references.error}</AuthMessage> : null}
      {references.loading ? <p className="form-helper">Loading options...</p> : null}
      <form
        className="dialog-form"
        id={formId}
        key={formKey}
        onSubmit={(event) => void create(event)}
      >
        <label>
          <span>Project name</span>
          <Input defaultValue={initial?.name ?? ''} maxLength={180} name="name" required />
        </label>
        <Select
          defaultValue={initial?.companyId}
          label="Client"
          name="companyId"
          options={references.companies.map((company) => ({
            label: company.name,
            value: company.id,
          }))}
          placeholder="Choose a company"
        />
        {references.users.length ? (
          <Select
            label="Project manager"
            name="projectManagerId"
            options={references.users.map((user) => ({ label: personName(user), value: user.id }))}
            placeholder="Unassigned"
          />
        ) : null}
        <div className="form-two-columns">
          <Select
            defaultValue="PLANNED"
            label="Status"
            name="status"
            options={projectStatuses.map((value) => ({ label: labelize(value), value }))}
          />
          <Select
            defaultValue="MEDIUM"
            label="Priority"
            name="priority"
            options={workPriorities.map((value) => ({ label: labelize(value), value }))}
          />
        </div>
        <div className="form-two-columns">
          <label>
            <span>Start date</span>
            <Input name="startDate" type="date" />
          </label>
          <label>
            <span>Deadline</span>
            <Input name="deadline" type="date" />
          </label>
        </div>
        <div className="form-two-columns">
          <label>
            <span>Project value</span>
            <Input
              defaultValue={initial?.projectValue ?? ''}
              min="0"
              name="projectValue"
              step="0.01"
              type="number"
            />
          </label>
          <label>
            <span>Currency</span>
            <Input defaultValue={initial?.currency ?? 'BDT'} maxLength={3} name="currency" />
          </label>
        </div>
        <label>
          <span>Description</span>
          <Textarea maxLength={10000} name="description" />
        </label>
        {initial?.sourceLeadId ? (
          <input name="sourceLeadId" type="hidden" value={initial.sourceLeadId} />
        ) : null}
        <AdditionalInformationFields
          definitions={configuration.definitions}
          tags={configuration.tags}
        />
      </form>
    </Sheet>
  );
}

export function TaskCreateSheet({
  initialProjectId,
  onCreated,
  onOpenChange,
  open,
  trigger,
}: BaseProps & {
  initialProjectId?: string;
  onCreated?: (task: TaskRecord) => Promise<void> | void;
}) {
  const current = useCurrentUser();
  const formId = useFormId('create-task');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formKey, setFormKey] = useState(0);
  const references = useWorkReferenceData();
  useEffect(() => {
    if (open) setFormKey((value) => value + 1);
    else setError('');
  }, [open]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const result = await apiRequest<{ data: TaskRecord }>('/tasks', {
        method: 'POST',
        body: JSON.stringify(payload(event.currentTarget)),
      });
      emitCrmDataChanged(['tasks', 'projects']);
      onOpenChange(false);
      await onCreated?.(result.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Task creation failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      description="Create focused delivery work inside a project."
      footer={
        <>
          <Button disabled={saving} onClick={() => onOpenChange(false)} variant="secondary">
            Cancel
          </Button>
          <Button form={formId} loading={saving} type="submit">
            Create task
          </Button>
        </>
      }
      onOpenChange={onOpenChange}
      open={open}
      title="New task"
      trigger={trigger}
    >
      {error || references.error ? <AuthMessage>{error || references.error}</AuthMessage> : null}
      {references.loading ? <p className="form-helper">Loading options...</p> : null}
      <form
        className="dialog-form"
        id={formId}
        key={formKey}
        onSubmit={(event) => void create(event)}
      >
        <label>
          <span>Task title</span>
          <Input maxLength={180} name="title" required />
        </label>
        <Select
          defaultValue={initialProjectId}
          disabled={Boolean(initialProjectId)}
          label="Project"
          name="projectId"
          options={references.projects.map((project) => ({
            label: project.name,
            value: project.id,
          }))}
          placeholder="Choose a project"
        />
        {initialProjectId ? (
          <input name="projectId" type="hidden" value={initialProjectId} />
        ) : null}
        <div className="form-two-columns">
          <Select
            defaultValue="TODO"
            label="Status"
            name="status"
            options={taskStatuses.map((value) => ({ label: labelize(value), value }))}
          />
          <Select
            defaultValue="MEDIUM"
            label="Priority"
            name="priority"
            options={workPriorities.map((value) => ({ label: labelize(value), value }))}
          />
        </div>
        {current.permissions.includes('task.assign') && references.users.length ? (
          <Select
            label="Assignee"
            name="assigneeId"
            options={references.users.map((user) => ({ label: personName(user), value: user.id }))}
            placeholder="Unassigned"
          />
        ) : null}
        <div className="form-two-columns">
          <label>
            <span>Start date</span>
            <Input name="startDate" type="date" />
          </label>
          <label>
            <span>Due date</span>
            <Input name="dueDate" type="date" />
          </label>
        </div>
        <label>
          <span>Estimated minutes</span>
          <Input min="1" name="estimatedMinutes" step="1" type="number" />
        </label>
        <label>
          <span>Description</span>
          <Textarea maxLength={10000} name="description" />
        </label>
      </form>
    </Sheet>
  );
}

function payload(form: HTMLFormElement) {
  const entries = [...new FormData(form).entries()].filter(
    ([key, value]) => value !== '' && key !== 'tagIds' && !key.startsWith('customField:'),
  );
  const result = Object.fromEntries(entries) as Record<string, string | number>;
  if (typeof result.estimatedMinutes === 'string')
    result.estimatedMinutes = Number(result.estimatedMinutes);
  return result;
}

function useFormId(prefix: string) {
  return `${prefix}-${useId().replaceAll(':', '')}`;
}
