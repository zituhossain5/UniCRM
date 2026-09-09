'use client';

import { useCurrentUser } from '@/components/auth-provider';
import { AuthMessage } from '@/components/auth-screen';
import { apiRequest } from '@/lib/api';
import type {
  AutomationAction,
  AutomationCondition,
  AutomationEntityType,
  AutomationRule,
  AutomationRun,
  AutomationTriggerType,
} from '@/lib/automation-types';
import { Badge, Button, IconButton, Input, LoadingState, Select } from '@unicrm/ui';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

type ReferenceItem = { id: string; name: string };
type CustomFieldReference = ReferenceItem & { fieldType: string; options: unknown };
type AutomationReferences = {
  users: Array<{ id: string; firstName: string; lastName: string }>;
  tags: ReferenceItem[];
  pipelines: Array<ReferenceItem & { stages: ReferenceItem[] }>;
  customFields: CustomFieldReference[];
  webhookSubscriptions: ReferenceItem[];
};

const triggers: Record<AutomationEntityType, AutomationTriggerType[]> = {
  LEAD: ['LEAD_CREATED', 'LEAD_STAGE_CHANGED', 'LEAD_OWNER_CHANGED'],
  PROJECT: ['PROJECT_CREATED', 'PROJECT_STATUS_CHANGED'],
  TASK: ['TASK_CREATED', 'TASK_STATUS_CHANGED', 'TASK_OVERDUE'],
  QUOTATION: ['QUOTATION_CREATED', 'QUOTATION_STATUS_CHANGED'],
  PAYMENT: ['PAYMENT_CREATED'],
};
const fields: Record<AutomationEntityType, string[]> = {
  LEAD: ['stageId', 'ownerId', 'priority', 'tagIds', 'pipelineId', 'estimatedValue', 'customField'],
  PROJECT: ['status', 'ownerId', 'priority', 'tagIds', 'amount', 'customField'],
  TASK: ['status', 'ownerId', 'priority'],
  QUOTATION: ['status', 'ownerId', 'amount'],
  PAYMENT: ['ownerId', 'amount'],
};
const actionTypes = [
  'CREATE_TASK',
  'CREATE_FOLLOW_UP',
  'ADD_TAG',
  'REMOVE_TAG',
  'ASSIGN_OWNER',
  'CHANGE_PRIORITY',
  'CREATE_NOTIFICATION',
  'TRIGGER_WEBHOOK',
];
const priorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const emptyReferences: AutomationReferences = {
  users: [],
  tags: [],
  pipelines: [],
  customFields: [],
  webhookSubscriptions: [],
};

function label(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/^./, (character) => character.toUpperCase());
}
function statusTone(status: AutomationRun['status']): 'neutral' | 'success' | 'warning' | 'danger' {
  if (status === 'SUCCEEDED') return 'success';
  if (status === 'FAILED') return 'danger';
  if (status === 'SKIPPED') return 'warning';
  return 'neutral';
}
function formatDateTime(value?: string | null) {
  return value
    ? new Date(value).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : 'Not completed';
}
function runActionRows(run: AutomationRun) {
  const results = run.actionResults ?? [];
  return (
    run.actionSummaries?.length ? run.actionSummaries : results.map(({ summary }) => summary)
  ).map((summary, index) => ({
    summary,
    result: results.find((item) => item.index === index),
  }));
}
function options(values: readonly string[]) {
  return values.map((value) => ({ label: label(value), value }));
}
function referenceOptions(values: ReferenceItem[]) {
  return values.map((item) => ({ label: item.name, value: item.id }));
}
function userOptions(references: AutomationReferences) {
  return references.users.map((user) => ({
    label: `${user.firstName} ${user.lastName}`,
    value: user.id,
  }));
}
function statusValues(entityType: AutomationEntityType) {
  if (entityType === 'PROJECT')
    return ['PLANNED', 'IN_PROGRESS', 'ON_HOLD', 'IN_REVIEW', 'COMPLETED', 'CANCELLED'];
  if (entityType === 'TASK') return ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED', 'BLOCKED'];
  return ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED'];
}
function blankCondition(entityType: AutomationEntityType): AutomationCondition {
  return { field: fields[entityType][0]!, operator: 'EQUALS', value: '' };
}
function blankAction(type = 'CREATE_NOTIFICATION'): AutomationAction {
  if (type === 'CHANGE_PRIORITY') return { type, priority: 'HIGH' };
  if (type === 'CREATE_FOLLOW_UP') return { type, dueInDays: 2, followUpType: 'CALL' };
  if (type === 'CREATE_TASK') return { type, dueInDays: 1, priority: 'MEDIUM' };
  if (type === 'CREATE_NOTIFICATION') return { type, title: 'Automation notification' };
  return { type };
}

function AutomationSelect({
  label: selectLabel,
  onValueChange,
  options: selectOptions,
  placeholder,
  value,
}: {
  label: string;
  onValueChange: (value: string) => void;
  options: ReadonlyArray<{ label: string; value: string }>;
  placeholder?: string;
  value?: string | null;
}) {
  return (
    <div className="automation-select">
      <Select
        label={selectLabel}
        onValueChange={(next) => next !== null && onValueChange(next)}
        options={selectOptions}
        placeholder={placeholder}
        value={value ?? null}
      />
    </div>
  );
}

function customOptions(field?: CustomFieldReference) {
  if (!field || !Array.isArray(field.options)) return [];
  return field.options
    .filter((value): value is string => typeof value === 'string')
    .map((value) => ({ label: value, value }));
}
function operatorsFor(condition: AutomationCondition, customField?: CustomFieldReference) {
  if (condition.field === 'tagIds') return ['CONTAINS', 'IS_EMPTY', 'IS_NOT_EMPTY'];
  const numeric =
    condition.field === 'amount' ||
    condition.field === 'estimatedValue' ||
    customField?.fieldType === 'NUMBER' ||
    customField?.fieldType === 'CURRENCY';
  if (numeric)
    return ['EQUALS', 'NOT_EQUALS', 'GREATER_THAN', 'LESS_THAN', 'IS_EMPTY', 'IS_NOT_EMPTY'];
  if (
    condition.field === 'customField' &&
    ['TEXT', 'LONG_TEXT', 'SELECT', 'MULTI_SELECT', 'EMAIL', 'PHONE', 'URL'].includes(
      customField?.fieldType ?? '',
    )
  )
    return ['EQUALS', 'NOT_EQUALS', 'CONTAINS', 'IS_EMPTY', 'IS_NOT_EMPTY'];
  return ['EQUALS', 'NOT_EQUALS', 'IS_EMPTY', 'IS_NOT_EMPTY'];
}

function ConditionValue({
  condition,
  entityType,
  index,
  references,
  update,
}: {
  condition: AutomationCondition;
  entityType: AutomationEntityType;
  index: number;
  references: AutomationReferences;
  update: (patch: Partial<AutomationCondition>) => void;
}) {
  if (condition.operator === 'IS_EMPTY' || condition.operator === 'IS_NOT_EMPTY')
    return (
      <div aria-hidden="true" className="automation-value-empty">
        No value needed
      </div>
    );
  const stages = references.pipelines.flatMap(({ stages: values }) => values);
  const customField = references.customFields.find(({ id }) => id === condition.fieldDefinitionId);
  let choices: Array<{ label: string; value: string }> = [];
  if (condition.field === 'ownerId') choices = userOptions(references);
  if (condition.field === 'tagIds') choices = referenceOptions(references.tags);
  if (condition.field === 'pipelineId') choices = referenceOptions(references.pipelines);
  if (condition.field === 'stageId') choices = referenceOptions(stages);
  if (condition.field === 'priority') choices = options(priorities);
  if (condition.field === 'status') choices = options(statusValues(entityType));
  if (customField?.fieldType === 'BOOLEAN')
    choices = [
      { label: 'True', value: 'true' },
      { label: 'False', value: 'false' },
    ];
  if (customField?.fieldType === 'SELECT' || customField?.fieldType === 'MULTI_SELECT')
    choices = customOptions(customField);
  if (choices.length)
    return (
      <AutomationSelect
        label={`Condition ${index + 1} value`}
        onValueChange={(value) =>
          update({
            value: customField?.fieldType === 'BOOLEAN' ? value === 'true' : value,
          })
        }
        options={choices}
        placeholder="Select value"
        value={
          typeof condition.value === 'boolean'
            ? String(condition.value)
            : String(condition.value ?? '') || null
        }
      />
    );
  const numeric =
    condition.field === 'amount' ||
    condition.field === 'estimatedValue' ||
    customField?.fieldType === 'NUMBER' ||
    customField?.fieldType === 'CURRENCY';
  return (
    <Input
      aria-label={`Condition ${index + 1} value`}
      inputMode={numeric ? 'decimal' : undefined}
      onChange={(event) => update({ value: event.target.value })}
      placeholder="Enter value"
      step={numeric ? 'any' : undefined}
      type={customField?.fieldType === 'DATE' ? 'date' : numeric ? 'number' : 'text'}
      value={String(condition.value ?? '')}
    />
  );
}

function ConditionRow({
  condition,
  entityType,
  index,
  onRemove,
  onUpdate,
  references,
}: {
  condition: AutomationCondition;
  entityType: AutomationEntityType;
  index: number;
  onRemove: () => void;
  onUpdate: (condition: AutomationCondition) => void;
  references: AutomationReferences;
}) {
  const customField = references.customFields.find(({ id }) => id === condition.fieldDefinitionId);
  const update = (patch: Partial<AutomationCondition>) => onUpdate({ ...condition, ...patch });
  return (
    <div className="automation-condition-row">
      <AutomationSelect
        label={`Condition ${index + 1} field`}
        onValueChange={(field) =>
          onUpdate({
            field,
            operator: field === 'tagIds' ? 'CONTAINS' : 'EQUALS',
            value: '',
          })
        }
        options={options(fields[entityType])}
        value={condition.field}
      />
      <AutomationSelect
        label={`Condition ${index + 1} operator`}
        onValueChange={(operator) => update({ operator })}
        options={options(operatorsFor(condition, customField))}
        value={condition.operator}
      />
      <div className="automation-condition-value">
        {condition.field === 'customField' ? (
          <AutomationSelect
            label={`Condition ${index + 1} custom field`}
            onValueChange={(fieldDefinitionId) => update({ fieldDefinitionId, value: '' })}
            options={referenceOptions(references.customFields)}
            placeholder="Select custom field"
            value={condition.fieldDefinitionId ?? null}
          />
        ) : null}
        <ConditionValue
          condition={condition}
          entityType={entityType}
          index={index}
          references={references}
          update={update}
        />
      </div>
      <IconButton label={`Remove condition ${index + 1}`} onClick={onRemove} size="sm">
        <Trash2 aria-hidden="true" size={15} />
      </IconButton>
    </div>
  );
}

function OwnerSelect({
  action,
  index,
  references,
  update,
  required = false,
}: {
  action: AutomationAction;
  index: number;
  references: AutomationReferences;
  update: (patch: Partial<AutomationAction>) => void;
  required?: boolean;
}) {
  return (
    <AutomationSelect
      label={`Action ${index + 1} owner`}
      onValueChange={(ownerId) => update({ ownerId: ownerId || undefined })}
      options={
        required
          ? userOptions(references)
          : [{ label: 'Use entity owner', value: '' }, ...userOptions(references)]
      }
      placeholder={required ? 'Select owner' : undefined}
      value={action.ownerId ?? (required ? null : '')}
    />
  );
}

function ActionConfiguration({
  action,
  index,
  references,
  update,
}: {
  action: AutomationAction;
  index: number;
  references: AutomationReferences;
  update: (patch: Partial<AutomationAction>) => void;
}) {
  if (action.type === 'ADD_TAG' || action.type === 'REMOVE_TAG')
    return (
      <AutomationSelect
        label={`Action ${index + 1} tag`}
        onValueChange={(tagId) => update({ tagId })}
        options={referenceOptions(references.tags)}
        placeholder="Select tag"
        value={action.tagId ?? null}
      />
    );
  if (action.type === 'ASSIGN_OWNER')
    return (
      <OwnerSelect action={action} index={index} references={references} required update={update} />
    );
  if (action.type === 'CHANGE_PRIORITY')
    return (
      <AutomationSelect
        label={`Action ${index + 1} priority`}
        onValueChange={(priority) => update({ priority })}
        options={options(priorities)}
        value={action.priority ?? 'HIGH'}
      />
    );
  if (action.type === 'TRIGGER_WEBHOOK')
    return (
      <AutomationSelect
        label={`Action ${index + 1} webhook`}
        onValueChange={(webhookSubscriptionId) => update({ webhookSubscriptionId })}
        options={referenceOptions(references.webhookSubscriptions)}
        placeholder="Select outbound webhook"
        value={action.webhookSubscriptionId ?? null}
      />
    );
  if (action.type === 'CREATE_FOLLOW_UP')
    return (
      <div className="automation-action-config automation-action-config--three">
        <label className="automation-compact-input">
          <span>Due in days</span>
          <Input
            aria-label={`Action ${index + 1} due in days`}
            min="0"
            onChange={(event) => update({ dueInDays: Number(event.target.value) })}
            type="number"
            value={action.dueInDays ?? 2}
          />
        </label>
        <AutomationSelect
          label={`Action ${index + 1} follow-up type`}
          onValueChange={(followUpType) => update({ followUpType })}
          options={options(['CALL', 'MEETING', 'EMAIL', 'OTHER'])}
          value={action.followUpType ?? 'CALL'}
        />
        <OwnerSelect action={action} index={index} references={references} update={update} />
      </div>
    );
  if (action.type === 'CREATE_TASK')
    return (
      <div className="automation-action-config automation-action-config--task">
        <Input
          aria-label={`Action ${index + 1} task title`}
          onChange={(event) => update({ title: event.target.value || undefined })}
          placeholder="Task title"
          value={action.title ?? ''}
        />
        <Input
          aria-label={`Action ${index + 1} due in days`}
          min="0"
          onChange={(event) => update({ dueInDays: Number(event.target.value) })}
          placeholder="Days"
          type="number"
          value={action.dueInDays ?? 1}
        />
        <AutomationSelect
          label={`Action ${index + 1} priority`}
          onValueChange={(priority) => update({ priority })}
          options={options(priorities)}
          value={action.priority ?? 'MEDIUM'}
        />
        <OwnerSelect action={action} index={index} references={references} update={update} />
      </div>
    );
  return (
    <div className="automation-action-config automation-action-config--notification">
      <Input
        aria-label={`Action ${index + 1} notification title`}
        onChange={(event) => update({ title: event.target.value || undefined })}
        placeholder="Notification title"
        value={action.title ?? ''}
      />
      <OwnerSelect action={action} index={index} references={references} update={update} />
    </div>
  );
}

function ActionRow({
  action,
  index,
  onRemove,
  onUpdate,
  references,
}: {
  action: AutomationAction;
  index: number;
  onRemove: () => void;
  onUpdate: (action: AutomationAction) => void;
  references: AutomationReferences;
}) {
  return (
    <div className="automation-action-row">
      <AutomationSelect
        label={`Action ${index + 1} type`}
        onValueChange={(type) => onUpdate(blankAction(type))}
        options={options(actionTypes)}
        value={action.type}
      />
      <ActionConfiguration
        action={action}
        index={index}
        references={references}
        update={(patch) => onUpdate({ ...action, ...patch })}
      />
      <IconButton label={`Remove action ${index + 1}`} onClick={onRemove} size="sm">
        <Trash2 aria-hidden="true" size={15} />
      </IconButton>
    </div>
  );
}

export function AutomationsSettings() {
  const current = useCurrentUser();
  const canManage = current.permissions.includes('automation.manage');
  const canRetry = current.permissions.includes('automation.retry');
  const [rules, setRules] = useState<AutomationRule[]>();
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [name, setName] = useState('');
  const [entityType, setEntityType] = useState<AutomationEntityType>('LEAD');
  const [triggerType, setTriggerType] = useState<AutomationTriggerType>('LEAD_CREATED');
  const [triggerConfig, setTriggerConfig] = useState<{ from?: string; to?: string }>({});
  const [conditions, setConditions] = useState<AutomationCondition[]>([]);
  const [actions, setActions] = useState<AutomationAction[]>([blankAction()]);
  const [active, setActive] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [references, setReferences] = useState<AutomationReferences>(emptyReferences);

  async function loadRules() {
    setError('');
    try {
      setRules((await apiRequest<{ data: AutomationRule[] }>('/automations')).data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load automations.');
    }
  }
  useEffect(() => {
    void loadRules();
  }, []);
  useEffect(() => {
    void apiRequest<{ data: AutomationReferences }>(
      `/automations/reference-data?entityType=${entityType}`,
    )
      .then((response) => setReferences(response.data))
      .catch((cause: unknown) =>
        setError(
          cause instanceof Error ? cause.message : 'Could not load automation reference data.',
        ),
      );
  }, [entityType]);

  async function selectRule(rule: AutomationRule) {
    setSelectedId(rule.id);
    setName(rule.name);
    setEntityType(rule.entityType);
    setTriggerType(rule.triggerType);
    setTriggerConfig(rule.triggerConfig ?? {});
    setConditions(rule.conditions);
    setActions(rule.actions);
    setActive(rule.active);
    try {
      setRuns((await apiRequest<{ data: AutomationRun[] }>(`/automations/${rule.id}/runs`)).data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load automation history.');
    }
  }
  function newRule() {
    setSelectedId('');
    setName('');
    setEntityType('LEAD');
    setTriggerType('LEAD_CREATED');
    setTriggerConfig({});
    setConditions([]);
    setActions([blankAction()]);
    setActive(true);
    setRuns([]);
  }

  const isChangeTrigger = triggerType.endsWith('_CHANGED');
  const stages = references.pipelines.flatMap(({ stages: values }) => values);
  const transitionOptions =
    triggerType === 'LEAD_STAGE_CHANGED'
      ? referenceOptions(stages)
      : triggerType === 'LEAD_OWNER_CHANGED'
        ? userOptions(references)
        : options(statusValues(entityType));

  function normalizedConditions() {
    return conditions.map((condition) => {
      if (condition.operator === 'IS_EMPTY' || condition.operator === 'IS_NOT_EMPTY')
        return {
          field: condition.field,
          operator: condition.operator,
          ...(condition.fieldDefinitionId
            ? { fieldDefinitionId: condition.fieldDefinitionId }
            : {}),
        };
      const customField = references.customFields.find(
        ({ id }) => id === condition.fieldDefinitionId,
      );
      if (
        condition.field === 'amount' ||
        condition.field === 'estimatedValue' ||
        customField?.fieldType === 'NUMBER' ||
        customField?.fieldType === 'CURRENCY'
      )
        return { ...condition, value: Number(condition.value) };
      return condition;
    });
  }
  async function save() {
    setError('');
    setMessage('');
    try {
      const response = await apiRequest<{ data: AutomationRule }>(
        selectedId ? `/automations/${selectedId}` : '/automations',
        {
          method: selectedId ? 'PATCH' : 'POST',
          body: JSON.stringify({
            name,
            entityType,
            triggerType,
            ...(isChangeTrigger ? { triggerConfig } : {}),
            conditions: normalizedConditions(),
            actions,
            active,
          }),
        },
      );
      setMessage(selectedId ? 'Automation updated.' : 'Automation created.');
      await loadRules();
      await selectRule(response.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save automation.');
    }
  }
  async function toggle(rule: AutomationRule) {
    await apiRequest(`/automations/${rule.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ active: !rule.active }),
    });
    await loadRules();
  }
  async function retry(runId: string) {
    try {
      await apiRequest(`/automations/runs/${runId}/retry`, { method: 'POST' });
      setMessage('Automation retry queued.');
      const rule = rules?.find(({ id }) => id === selectedId);
      if (rule) await selectRule(rule);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not retry automation.');
    }
  }
  if (!rules && !error) return <LoadingState label="Loading automations" />;

  return (
    <section className="settings-section settings-section--wide">
      <header className="settings-section-header">
        <div>
          <h2>Automations</h2>
          <p>Controlled event-based actions with auditable run history.</p>
        </div>
        {canManage ? (
          <Button onClick={newRule} type="button">
            New automation
          </Button>
        ) : null}
      </header>
      {error ? <AuthMessage>{error}</AuthMessage> : null}
      {message ? <AuthMessage>{message}</AuthMessage> : null}
      <div className="configuration-list">
        {rules?.map((rule) => (
          <div className="configuration-row" key={rule.id}>
            <button className="text-button" onClick={() => void selectRule(rule)} type="button">
              <strong>{rule.name}</strong>
              <small>{label(rule.triggerType)}</small>
            </button>
            <span>{rule.active ? 'Enabled' : 'Disabled'}</span>
            {canManage ? (
              <Button onClick={() => void toggle(rule)} type="button" variant="secondary">
                {rule.active ? 'Disable' : 'Enable'}
              </Button>
            ) : null}
          </div>
        ))}
      </div>

      {canManage ? (
        <form
          className="automation-editor"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <header className="automation-editor-header">
            <div>
              <h3>{selectedId ? 'Edit automation' : 'Create automation'}</h3>
              <p>Define when this rule runs and what it should do.</p>
            </div>
            <span className="automation-rule-state">{active ? 'Enabled' : 'Disabled'}</span>
          </header>
          <label className="automation-name-field" htmlFor="automation-name">
            <span>Automation name</span>
            <Input
              id="automation-name"
              placeholder="For example: High Value Qualified Lead"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <section aria-labelledby="automation-when" className="automation-builder-section">
            <div className="automation-builder-heading">
              <span>When</span>
              <div>
                <h4 id="automation-when">Choose the trigger</h4>
                <p>The event that starts this automation.</p>
              </div>
            </div>
            <div className="automation-trigger-grid">
              <AutomationSelect
                label="Entity"
                onValueChange={(value) => {
                  const next = value as AutomationEntityType;
                  setEntityType(next);
                  setTriggerType(triggers[next][0]!);
                  setTriggerConfig({});
                  setConditions([]);
                }}
                options={options(Object.keys(triggers))}
                value={entityType}
              />
              <AutomationSelect
                label="Trigger"
                onValueChange={(value) => {
                  setTriggerType(value as AutomationTriggerType);
                  setTriggerConfig({});
                }}
                options={options(triggers[entityType])}
                value={triggerType}
              />
            </div>
            {isChangeTrigger ? (
              <div className="automation-trigger-grid automation-trigger-grid--transition">
                <AutomationSelect
                  label="From (optional)"
                  onValueChange={(from) =>
                    setTriggerConfig((value) => ({ ...value, from: from || undefined }))
                  }
                  options={[{ label: 'Any value', value: '' }, ...transitionOptions]}
                  value={triggerConfig.from ?? ''}
                />
                <AutomationSelect
                  label="To (optional)"
                  onValueChange={(to) =>
                    setTriggerConfig((value) => ({ ...value, to: to || undefined }))
                  }
                  options={[{ label: 'Any value', value: '' }, ...transitionOptions]}
                  value={triggerConfig.to ?? ''}
                />
              </div>
            ) : null}
          </section>

          <section aria-labelledby="automation-if" className="automation-builder-section">
            <div className="automation-builder-heading">
              <span>If</span>
              <div>
                <h4 id="automation-if">All of these conditions match</h4>
                <p>Leave empty to run for every matching trigger.</p>
              </div>
            </div>
            <div className="automation-builder-rows">
              {conditions.length ? (
                conditions.map((condition, index) => (
                  <ConditionRow
                    condition={condition}
                    entityType={entityType}
                    index={index}
                    key={index}
                    onRemove={() =>
                      setConditions((items) => items.filter((_, itemIndex) => itemIndex !== index))
                    }
                    onUpdate={(next) =>
                      setConditions((items) =>
                        items.map((item, itemIndex) => (itemIndex === index ? next : item)),
                      )
                    }
                    references={references}
                  />
                ))
              ) : (
                <p className="automation-empty-row">No conditions — this rule runs every time.</p>
              )}
            </div>
            <Button
              className="automation-add-button"
              onClick={() => setConditions((items) => [...items, blankCondition(entityType)])}
              type="button"
              variant="outline"
            >
              <Plus aria-hidden="true" size={15} /> Add condition
            </Button>
          </section>

          <section aria-labelledby="automation-then" className="automation-builder-section">
            <div className="automation-builder-heading">
              <span>Then</span>
              <div>
                <h4 id="automation-then">Perform these actions</h4>
                <p>Actions run in order from top to bottom.</p>
              </div>
            </div>
            <div className="automation-builder-rows">
              {actions.map((action, index) => (
                <ActionRow
                  action={action}
                  index={index}
                  key={index}
                  onRemove={() =>
                    setActions((items) => items.filter((_, itemIndex) => itemIndex !== index))
                  }
                  onUpdate={(next) =>
                    setActions((items) =>
                      items.map((item, itemIndex) => (itemIndex === index ? next : item)),
                    )
                  }
                  references={references}
                />
              ))}
            </div>
            <Button
              className="automation-add-button"
              onClick={() => setActions((items) => [...items, blankAction()])}
              type="button"
              variant="outline"
            >
              <Plus aria-hidden="true" size={15} /> Add action
            </Button>
          </section>
          <footer className="automation-editor-actions">
            <Button disabled={!name.trim() || actions.length === 0} type="submit">
              {selectedId ? 'Save changes' : 'Create automation'}
            </Button>
          </footer>
        </form>
      ) : null}

      {selectedId ? (
        <div className="configuration-list">
          <h3>Run history</h3>
          {runs.length ? (
            runs.map((run) => (
              <details className="automation-run-row" key={run.id}>
                <summary>
                  <div className="automation-run-main">
                    <Badge tone={statusTone(run.status)}>{label(run.status)}</Badge>
                    <div>
                      <strong>{label(run.entityType)}</strong>
                      <span>{run.entityLabel ?? run.entityId}</span>
                    </div>
                    <div>
                      <small>Trigger</small>
                      <span>{run.triggerSummary ?? label(run.triggerEventId)}</span>
                    </div>
                    <div>
                      <small>Actions</small>
                      <span>
                        {run.actionSummary ?? `${run.actionResults?.length ?? 0} actions completed`}
                      </span>
                    </div>
                    <time dateTime={run.completedAt ?? run.createdAt}>
                      {formatDateTime(run.completedAt ?? run.createdAt)}
                    </time>
                  </div>
                  {canRetry && run.status === 'FAILED' && run.retryable ? (
                    <Button variant="secondary" onClick={() => void retry(run.id)} type="button">
                      Retry
                    </Button>
                  ) : null}
                </summary>
                <div className="automation-run-details">
                  <div>
                    <small>Trigger</small>
                    <strong>{run.triggerSummary ?? label(run.triggerEventId)}</strong>
                  </div>
                  <div>
                    <small>Conditions</small>
                    {run.conditionSummaries?.length ? (
                      <ul>
                        {run.conditionSummaries.map((summary) => (
                          <li key={summary}>{summary}</li>
                        ))}
                      </ul>
                    ) : (
                      <span>No conditions</span>
                    )}
                  </div>
                  <div>
                    <small>Actions</small>
                    <ul>
                      {runActionRows(run).map(({ result, summary }, index) => (
                        <li key={`${summary}-${index}`}>
                          <Badge tone={statusTone(result?.status ?? 'PENDING')}>
                            {label(result?.status ?? 'PENDING')}
                          </Badge>
                          <span>{summary}</span>
                          {result?.summary ? <small>{result.summary}</small> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="automation-run-execution">
                    <span>Started: {formatDateTime(run.startedAt)}</span>
                    <span>Completed: {formatDateTime(run.completedAt)}</span>
                    <span>Attempts: {run.attemptCount}</span>
                  </div>
                  {run.errorSummary ? (
                    <p className="automation-run-error">{run.errorSummary}</p>
                  ) : null}
                </div>
              </details>
            ))
          ) : (
            <p>No runs yet.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
