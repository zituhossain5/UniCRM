'use client';

import { useCurrentUser } from '@/components/auth-provider';
import { AuthMessage } from '@/components/auth-screen';
import { apiRequest } from '@/lib/api';
import type {
  AutomationAction,
  AutomationCondition,
  AutomationEntityType,
  AutomationGraphMetadata,
  AutomationGraphNode,
  AutomationRule,
  AutomationRun,
  AutomationTriggerType,
} from '@/lib/automation-types';
import { Badge, Button, IconButton, Input, LoadingState, Select } from '@unicrm/ui';
import {
  addEdge,
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import { ArrowLeft, Edit3, GitBranch, MousePointer2, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

type ReferenceItem = { id: string; name: string };
type CustomFieldReference = ReferenceItem & { fieldType: string; options: unknown };
type AutomationReferences = {
  users: Array<{ id: string; firstName: string; lastName: string }>;
  tags: ReferenceItem[];
  pipelines: Array<ReferenceItem & { stages: ReferenceItem[] }>;
  customFields: CustomFieldReference[];
  webhookSubscriptions: ReferenceItem[];
};
type AutomationBuilderMode = 'visual' | 'form' | 'history';
type FlowNodeData = AutomationGraphNode['data'] & {
  nodeType: AutomationGraphNode['type'];
} & Record<string, unknown>;
type FlowNode = Node<FlowNodeData>;

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
function flowNodes(graph: AutomationGraphMetadata): FlowNode[] {
  return graph.nodes.map((node) => ({
    id: node.id,
    type: 'automation',
    position: node.position,
    data: { ...node.data, nodeType: node.type },
  }));
}
function flowEdges(graph: AutomationGraphMetadata): Edge[] {
  return graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? undefined,
    type: 'smoothstep',
    animated: false,
  }));
}
function normalizedConditionValue(
  condition: AutomationCondition,
  references: AutomationReferences = emptyReferences,
) {
  if (condition.operator === 'IS_EMPTY' || condition.operator === 'IS_NOT_EMPTY')
    return {
      field: condition.field,
      operator: condition.operator,
      ...(condition.fieldDefinitionId ? { fieldDefinitionId: condition.fieldDefinitionId } : {}),
    };
  const customField = references.customFields.find(({ id }) => id === condition.fieldDefinitionId);
  if (
    condition.field === 'amount' ||
    condition.field === 'estimatedValue' ||
    customField?.fieldType === 'NUMBER' ||
    customField?.fieldType === 'CURRENCY'
  )
    return { ...condition, value: Number(condition.value) };
  return condition;
}
function graphFromFlow(
  nodes: FlowNode[],
  edges: Edge[],
  references?: AutomationReferences,
): AutomationGraphMetadata {
  return {
    version: 1,
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.data.nodeType,
      position: node.position,
      data: {
        entityType: node.data.entityType,
        triggerType: node.data.triggerType,
        triggerConfig: node.data.triggerConfig,
        condition: node.data.condition
          ? normalizedConditionValue(node.data.condition, references)
          : undefined,
        action: node.data.action,
      },
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? null,
    })),
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}
function graphFromRuleState(
  entityType: AutomationEntityType,
  triggerType: AutomationTriggerType,
  triggerConfig: { from?: string; to?: string },
  conditions: AutomationCondition[],
  actions: AutomationAction[],
): AutomationGraphMetadata {
  const nodes: AutomationGraphMetadata['nodes'] = [
    {
      id: 'trigger',
      type: 'trigger',
      position: { x: 90, y: 80 },
      data: { entityType, triggerType, triggerConfig },
    },
  ];
  const edges: AutomationGraphMetadata['edges'] = [];
  let previous = 'trigger';
  conditions.forEach((condition, index) => {
    const id = `condition-${index + 1}`;
    nodes.push({
      id,
      type: 'condition',
      position: { x: 90, y: 230 + index * 140 },
      data: { condition },
    });
    edges.push({ id: `${previous}-${id}`, source: previous, target: id, sourceHandle: 'true' });
    previous = id;
  });
  actions.forEach((action, index) => {
    const id = `action-${index + 1}`;
    nodes.push({
      id,
      type: 'action',
      position: { x: 90, y: 230 + (conditions.length + index) * 140 },
      data: { action },
    });
    edges.push({ id: `${previous}-${id}`, source: previous, target: id, sourceHandle: 'true' });
    previous = id;
  });
  return { version: 1, nodes, edges, viewport: { x: 0, y: 0, zoom: 1 } };
}
function orderedVisualNodes(graph: AutomationGraphMetadata) {
  const trigger = graph.nodes.find((node) => node.type === 'trigger');
  const outgoing = new Map(graph.edges.map((edge) => [edge.source, edge.target]));
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const ordered: AutomationGraphNode[] = [];
  const seen = new Set<string>();
  let currentId = trigger?.id;
  while (currentId && !seen.has(currentId)) {
    const node = byId.get(currentId);
    if (!node) break;
    ordered.push(node);
    seen.add(currentId);
    currentId = outgoing.get(currentId);
  }
  return ordered;
}
function ruleStateFromGraph(graph: AutomationGraphMetadata) {
  const trigger = graph.nodes.find((node) => node.type === 'trigger');
  const ordered = orderedVisualNodes(graph);
  return {
    entityType: trigger?.data.entityType ?? 'LEAD',
    triggerType: trigger?.data.triggerType ?? 'LEAD_CREATED',
    triggerConfig: trigger?.data.triggerConfig ?? {},
    conditions: ordered
      .filter((node) => node.type === 'condition' && node.data.condition)
      .map((node) => node.data.condition!),
    actions: ordered
      .filter((node) => node.type === 'action' && node.data.action)
      .map((node) => node.data.action!),
  };
}
function ruleGraph(rule: AutomationRule) {
  return (
    rule.graphMetadata ??
    graphFromRuleState(
      rule.entityType,
      rule.triggerType,
      rule.triggerConfig ?? {},
      rule.conditions,
      rule.actions,
    )
  );
}
function nextNodeId(prefix: 'condition' | 'action', nodes: FlowNode[]) {
  const count = nodes.filter((node) => node.data.nodeType === prefix).length + 1;
  return `${prefix}-${count}-${crypto.randomUUID().slice(0, 8)}`;
}
function nodeLabel(data: FlowNodeData) {
  if (data.nodeType === 'trigger') return data.triggerType ? label(data.triggerType) : 'Trigger';
  if (data.nodeType === 'condition')
    return data.condition ? label(data.condition.field) : 'Condition';
  return data.action ? label(data.action.type) : 'Action';
}
function actionDetail(action?: AutomationAction) {
  if (!action) return 'Configure action';
  if (action.type === 'ADD_TAG' || action.type === 'REMOVE_TAG')
    return action.tagId ? 'Tag selected' : 'Select tag';
  if (action.type === 'CHANGE_PRIORITY') return label(action.priority ?? 'HIGH');
  if (action.type === 'CREATE_FOLLOW_UP') return `+${action.dueInDays ?? 2} days`;
  if (action.type === 'CREATE_NOTIFICATION') return action.title ?? 'Automation notification';
  if (action.type === 'CREATE_TASK') return action.title ?? 'Automation task';
  if (action.type === 'ASSIGN_OWNER') return action.ownerId ? 'Owner selected' : 'Select owner';
  return action.webhookSubscriptionId ? 'Webhook selected' : 'Select webhook';
}
function AutomationFlowNode({ data, selected }: NodeProps<FlowNode>) {
  const tone =
    data.nodeType === 'trigger' ? 'primary' : data.nodeType === 'condition' ? 'warning' : 'success';
  return (
    <div
      className={`automation-flow-node automation-flow-node--${tone}${selected ? ' is-selected' : ''}`}
    >
      {data.nodeType !== 'trigger' ? <Handle position={Position.Top} type="target" /> : null}
      <span>{label(data.nodeType)}</span>
      <strong>{nodeLabel(data)}</strong>
      <small>
        {data.nodeType === 'trigger'
          ? data.triggerConfig?.to
            ? 'Filtered transition'
            : 'Any matching event'
          : data.nodeType === 'condition'
            ? data.condition
              ? `${label(data.condition.operator)} ${String(data.condition.value ?? '')}`.trim()
              : 'Configure condition'
            : actionDetail(data.action)}
      </small>
      {data.nodeType === 'condition' ? (
        <>
          <Handle id="true" position={Position.Bottom} type="source" />
          <Handle
            className="automation-flow-node-false"
            id="false"
            isConnectable={false}
            position={Position.Right}
            type="source"
          />
        </>
      ) : (
        <Handle id="true" position={Position.Bottom} type="source" />
      )}
    </div>
  );
}
const automationNodeTypes = { automation: AutomationFlowNode };

function AutomationRunGraphSummary({
  graph,
  run,
}: {
  graph: AutomationGraphMetadata | null;
  run: AutomationRun;
}) {
  if (!graph) return null;
  let actionIndex = 0;
  const nodes = orderedVisualNodes(graph);
  return (
    <div className="automation-run-graph" aria-label="Automation run graph outcome">
      {nodes.map((node) => {
        const actionResult =
          node.type === 'action'
            ? run.actionResults?.find(({ index }) => index === actionIndex++)
            : null;
        const state =
          node.type === 'trigger'
            ? 'completed'
            : node.type === 'condition'
              ? run.status === 'SKIPPED'
                ? 'skipped'
                : 'completed'
              : actionResult?.status === 'FAILED'
                ? 'failed'
                : actionResult?.status === 'SKIPPED'
                  ? 'skipped'
                  : actionResult?.status === 'SUCCEEDED'
                    ? 'completed'
                    : 'pending';
        return (
          <span className={`automation-run-graph-node is-${state}`} key={node.id}>
            <small>{label(node.type)}</small>
            <strong>{nodeLabel({ ...node.data, nodeType: node.type })}</strong>
            <em>{label(state)}</em>
          </span>
        );
      })}
    </div>
  );
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

function AutomationVisualBuilder({
  actions,
  conditions,
  entityType,
  graphMetadata,
  references,
  setEntityType,
  setGraphMetadata,
  triggerConfig,
  triggerType,
}: {
  actions: AutomationAction[];
  conditions: AutomationCondition[];
  entityType: AutomationEntityType;
  graphMetadata: AutomationGraphMetadata | null;
  references: AutomationReferences;
  setEntityType: (entityType: AutomationEntityType) => void;
  setGraphMetadata: (graph: AutomationGraphMetadata) => void;
  triggerConfig: { from?: string; to?: string };
  triggerType: AutomationTriggerType;
}) {
  const initialGraph = useMemo(
    () =>
      graphMetadata ??
      graphFromRuleState(entityType, triggerType, triggerConfig, conditions, actions),
    [actions, conditions, entityType, graphMetadata, triggerConfig, triggerType],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes(initialGraph));
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges(initialGraph));
  const [selectedNodeId, setSelectedNodeId] = useState('trigger');
  const stages = references.pipelines.flatMap(({ stages: values }) => values);
  const selectedNode = nodes.find(({ id }) => id === selectedNodeId) ?? nodes[0];
  const selectedIndex = selectedNode
    ? nodes
        .filter(({ data }) => data.nodeType === selectedNode.data.nodeType)
        .findIndex(({ id }) => id === selectedNode.id)
    : 0;
  const selectedCondition = selectedNode?.data.condition ?? blankCondition(entityType);
  const selectedAction = selectedNode?.data.action ?? blankAction();
  const isChangeNodeTrigger = selectedNode?.data.triggerType?.endsWith('_CHANGED') ?? false;
  const selectedTransitionOptions =
    selectedNode?.data.triggerType === 'LEAD_STAGE_CHANGED'
      ? referenceOptions(stages)
      : selectedNode?.data.triggerType === 'LEAD_OWNER_CHANGED'
        ? userOptions(references)
        : options(statusValues(selectedNode?.data.entityType ?? entityType));

  useEffect(() => {
    setGraphMetadata(graphFromFlow(nodes, edges, references));
  }, [edges, nodes, references, setGraphMetadata]);

  useEffect(() => {
    if (!nodes.some(({ id }) => id === selectedNodeId)) setSelectedNodeId('trigger');
  }, [nodes, selectedNodeId]);

  function updateSelectedNode(patch: Partial<FlowNodeData>) {
    setNodes((items) =>
      items.map((node) =>
        node.id === selectedNodeId ? { ...node, data: { ...node.data, ...patch } } : node,
      ),
    );
  }
  function addNode(type: 'condition' | 'action') {
    const id = nextNodeId(type, nodes);
    const last = nodes[nodes.length - 1]!;
    setNodes((items) => [
      ...items,
      {
        id,
        type: 'automation',
        position: { x: last.position.x, y: last.position.y + 140 },
        data:
          type === 'condition'
            ? { nodeType: type, condition: blankCondition(entityType) }
            : { nodeType: type, action: blankAction() },
      },
    ]);
    setEdges((items) => [
      ...items,
      {
        id: `${last.id}-${id}`,
        source: last.id,
        target: id,
        sourceHandle: 'true',
        type: 'smoothstep',
      },
    ]);
    setSelectedNodeId(id);
  }
  function deleteSelectedNode() {
    if (!selectedNode || selectedNode.data.nodeType === 'trigger') return;
    setNodes((items) => items.filter(({ id }) => id !== selectedNode.id));
    setEdges((items) =>
      items.filter(
        ({ source, target }) => source !== selectedNode.id && target !== selectedNode.id,
      ),
    );
    setSelectedNodeId('trigger');
  }
  function connect(connection: Connection) {
    if (!connection.source || !connection.target) return;
    setEdges((items) =>
      addEdge(
        {
          ...connection,
          id: `${connection.source}-${connection.target}`,
          type: 'smoothstep',
        },
        items.filter(({ source }) => source !== connection.source),
      ),
    );
  }

  return (
    <div className="automation-visual-builder">
      <div className="automation-visual-toolbar">
        <Button onClick={() => addNode('condition')} type="button" variant="outline">
          <GitBranch aria-hidden="true" size={15} /> Add condition
        </Button>
        <Button onClick={() => addNode('action')} type="button" variant="outline">
          <Plus aria-hidden="true" size={15} /> Add action
        </Button>
        <Button
          disabled={!selectedNode || selectedNode.data.nodeType === 'trigger'}
          onClick={deleteSelectedNode}
          type="button"
          variant="secondary"
        >
          <Trash2 aria-hidden="true" size={15} /> Delete selected
        </Button>
      </div>
      <div className="automation-visual-workspace">
        <ReactFlowProvider>
          <div className="automation-canvas" aria-label="Visual automation workflow builder">
            <ReactFlow
              edges={edges}
              fitView
              nodes={nodes}
              nodeTypes={automationNodeTypes}
              onConnect={connect}
              onEdgesChange={onEdgesChange}
              onNodeClick={(_, node) => setSelectedNodeId(node.id)}
              onNodesChange={onNodesChange}
            >
              <Background gap={18} size={1} />
              <Controls showInteractive={false} />
              <MiniMap pannable zoomable />
            </ReactFlow>
          </div>
        </ReactFlowProvider>
        <aside className="automation-node-panel" aria-live="polite">
          <header>
            <MousePointer2 aria-hidden="true" size={16} />
            <div>
              <h4>Node configuration</h4>
              <p>{selectedNode ? label(selectedNode.data.nodeType) : 'Select a node'}</p>
            </div>
          </header>
          {selectedNode?.data.nodeType === 'trigger' ? (
            <div className="automation-node-fields">
              <AutomationSelect
                label="Entity"
                onValueChange={(value) => {
                  const next = value as AutomationEntityType;
                  setEntityType(next);
                  updateSelectedNode({
                    entityType: next,
                    triggerType: triggers[next][0],
                    triggerConfig: {},
                  });
                }}
                options={options(Object.keys(triggers))}
                value={selectedNode.data.entityType ?? entityType}
              />
              <AutomationSelect
                label="Trigger"
                onValueChange={(value) =>
                  updateSelectedNode({
                    triggerType: value as AutomationTriggerType,
                    triggerConfig: {},
                  })
                }
                options={options(triggers[selectedNode.data.entityType ?? entityType])}
                value={selectedNode.data.triggerType ?? triggerType}
              />
              {isChangeNodeTrigger ? (
                <>
                  <AutomationSelect
                    label="From (optional)"
                    onValueChange={(from) =>
                      updateSelectedNode({
                        triggerConfig: {
                          ...selectedNode.data.triggerConfig,
                          from: from || undefined,
                        },
                      })
                    }
                    options={[{ label: 'Any value', value: '' }, ...selectedTransitionOptions]}
                    value={selectedNode.data.triggerConfig?.from ?? ''}
                  />
                  <AutomationSelect
                    label="To (optional)"
                    onValueChange={(to) =>
                      updateSelectedNode({
                        triggerConfig: { ...selectedNode.data.triggerConfig, to: to || undefined },
                      })
                    }
                    options={[{ label: 'Any value', value: '' }, ...selectedTransitionOptions]}
                    value={selectedNode.data.triggerConfig?.to ?? ''}
                  />
                </>
              ) : null}
            </div>
          ) : null}
          {selectedNode?.data.nodeType === 'condition' ? (
            <ConditionRow
              condition={selectedCondition}
              entityType={entityType}
              index={selectedIndex}
              onRemove={deleteSelectedNode}
              onUpdate={(condition) => updateSelectedNode({ condition })}
              references={references}
            />
          ) : null}
          {selectedNode?.data.nodeType === 'action' ? (
            <ActionRow
              action={selectedAction}
              index={selectedIndex}
              onRemove={deleteSelectedNode}
              onUpdate={(action) => updateSelectedNode({ action })}
              references={references}
            />
          ) : null}
          <p className="automation-branch-note">
            Conditions use the existing all-match engine. The true path continues to actions; a
            false result ends the run as skipped.
          </p>
        </aside>
      </div>
    </div>
  );
}

function AutomationLastRun({ canRead, ruleId }: { canRead: boolean; ruleId: string }) {
  const [run, setRun] = useState<AutomationRun | null>();
  useEffect(() => {
    if (!canRead) {
      setRun(null);
      return;
    }
    void apiRequest<{ data: AutomationRun[] }>(`/automations/${ruleId}/runs`)
      .then((response) => setRun(response.data[0] ?? null))
      .catch(() => setRun(null));
  }, [canRead, ruleId]);
  if (!canRead) return <span className="automation-list-muted">Not available</span>;
  if (run === undefined) return <span className="automation-list-muted">Loading...</span>;
  if (!run) return <span className="automation-list-muted">No runs yet</span>;
  return (
    <span className="automation-list-last-run">
      <Badge tone={statusTone(run.status)}>{label(run.status)}</Badge>
      <time dateTime={run.completedAt ?? run.createdAt}>
        {formatDateTime(run.completedAt ?? run.createdAt)}
      </time>
    </span>
  );
}

export function AutomationsSettings({
  automationId,
  view = 'list',
}: {
  automationId?: string;
  view?: 'list' | 'editor';
} = {}) {
  const current = useCurrentUser();
  const router = useRouter();
  const canManage = current.permissions.includes('automation.manage');
  const canReadRuns = current.permissions.includes('automation.runs.read');
  const canRetry = current.permissions.includes('automation.retry');
  const [rules, setRules] = useState<AutomationRule[]>();
  const [ruleLoading, setRuleLoading] = useState(Boolean(automationId));
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [selectedId, setSelectedId] = useState(automationId ?? '');
  const [name, setName] = useState('');
  const [entityType, setEntityType] = useState<AutomationEntityType>('LEAD');
  const [triggerType, setTriggerType] = useState<AutomationTriggerType>('LEAD_CREATED');
  const [triggerConfig, setTriggerConfig] = useState<{ from?: string; to?: string }>({});
  const [conditions, setConditions] = useState<AutomationCondition[]>([]);
  const [actions, setActions] = useState<AutomationAction[]>([blankAction()]);
  const [active, setActive] = useState(true);
  const [builderMode, setBuilderMode] = useState<AutomationBuilderMode>('visual');
  const [graphMetadata, setGraphMetadata] = useState<AutomationGraphMetadata | null>(null);
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
    if (view === 'editor' && window.matchMedia('(max-width: 640px)').matches)
      setBuilderMode('form');
  }, [view]);
  useEffect(() => {
    if (view !== 'editor' || !automationId) return;
    setError('');
    setRuleLoading(true);
    void Promise.all([
      apiRequest<{ data: AutomationRule }>(`/automations/${automationId}`),
      canReadRuns
        ? apiRequest<{ data: AutomationRun[] }>(`/automations/${automationId}/runs`)
        : Promise.resolve({ data: [] as AutomationRun[] }),
    ])
      .then(([ruleResponse, runResponse]) => {
        const rule = ruleResponse.data;
        setSelectedId(rule.id);
        setName(rule.name);
        setEntityType(rule.entityType);
        setTriggerType(rule.triggerType);
        setTriggerConfig(rule.triggerConfig ?? {});
        setConditions(rule.conditions);
        setActions(rule.actions);
        setActive(rule.active);
        setGraphMetadata(ruleGraph(rule));
        setRuns(runResponse.data);
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'Could not load automation.'),
      )
      .finally(() => setRuleLoading(false));
  }, [automationId, canReadRuns, view]);
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
    setGraphMetadata(ruleGraph(rule));
    if (!canReadRuns) {
      setRuns([]);
      return;
    }
    try {
      setRuns((await apiRequest<{ data: AutomationRun[] }>(`/automations/${rule.id}/runs`)).data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load automation history.');
    }
  }
  function newRule() {
    if (view === 'list') {
      router.push('/app/settings/automations/new');
      return;
    }
    setSelectedId('');
    setName('');
    setEntityType('LEAD');
    setTriggerType('LEAD_CREATED');
    setTriggerConfig({});
    setConditions([]);
    setActions([blankAction()]);
    setActive(true);
    setGraphMetadata(graphFromRuleState('LEAD', 'LEAD_CREATED', {}, [], [blankAction()]));
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
    return conditions.map((condition) => normalizedConditionValue(condition, references));
  }
  async function save() {
    setError('');
    setMessage('');
    try {
      const currentGraph =
        builderMode === 'form'
          ? undefined
          : (graphMetadata ??
            graphFromRuleState(entityType, triggerType, triggerConfig, conditions, actions));
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
            ...(currentGraph ? { graphMetadata: currentGraph } : {}),
          }),
        },
      );
      const wasExisting = Boolean(selectedId);
      setMessage(wasExisting ? 'Automation updated.' : 'Automation created.');
      await loadRules();
      await selectRule(response.data);
      if (!wasExisting) router.replace(`/app/settings/automations/${response.data.id}`);
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
  if ((!rules || ruleLoading) && !error) return <LoadingState label="Loading automations" />;

  if (view === 'list')
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
        <div className="automation-management-list">
          {rules?.length ? (
            rules.map((rule) => (
              <article className="automation-management-row" key={rule.id}>
                <Link
                  className="automation-management-summary"
                  href={`/app/settings/automations/${rule.id}`}
                >
                  <strong>{rule.name}</strong>
                  <small>{label(rule.triggerType)}</small>
                </Link>
                <span className="automation-management-state">
                  <Badge tone={rule.active ? 'success' : 'neutral'}>
                    {rule.active ? 'Enabled' : 'Disabled'}
                  </Badge>
                </span>
                <AutomationLastRun canRead={canReadRuns} ruleId={rule.id} />
                <div className="automation-management-actions">
                  {canManage ? (
                    <Button onClick={() => void toggle(rule)} type="button" variant="secondary">
                      {rule.active ? 'Disable' : 'Enable'}
                    </Button>
                  ) : null}
                  <Button
                    onClick={() => router.push(`/app/settings/automations/${rule.id}`)}
                    type="button"
                    variant="outline"
                  >
                    <Edit3 aria-hidden="true" size={14} /> {canManage ? 'Edit' : 'View'}
                  </Button>
                </div>
              </article>
            ))
          ) : (
            <div className="automation-management-empty">
              <strong>No automations yet</strong>
              <p>Create a controlled workflow from an existing UniCRM event.</p>
            </div>
          )}
        </div>
      </section>
    );
  const selectedRuleGraph = rules?.find(({ id }) => id === selectedId);

  return (
    <section className="automation-editor-page">
      <header className="automation-workspace-header">
        <div>
          <Link className="automation-back-link" href="/app/settings/automations">
            <ArrowLeft aria-hidden="true" size={15} /> Automations
          </Link>
          <div className="automation-workspace-title">
            <h1>{name.trim() || 'New automation'}</h1>
            <Badge tone={active ? 'success' : 'neutral'}>{active ? 'Enabled' : 'Disabled'}</Badge>
          </div>
        </div>
        <div className="automation-workspace-actions">
          {canManage ? (
            <Button
              onClick={() => {
                if (!selectedId) {
                  setActive((value) => !value);
                  return;
                }
                void apiRequest(`/automations/${selectedId}`, {
                  method: 'PATCH',
                  body: JSON.stringify({ active: !active }),
                })
                  .then(() => {
                    setActive((value) => !value);
                    setMessage(active ? 'Automation disabled.' : 'Automation enabled.');
                  })
                  .catch((cause: unknown) =>
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : 'Could not update automation status.',
                    ),
                  );
              }}
              type="button"
              variant="secondary"
            >
              {active ? 'Disable' : 'Enable'}
            </Button>
          ) : null}
          {canManage ? (
            <Button
              disabled={!name.trim() || actions.length === 0}
              form="automation-editor-form"
              type="submit"
            >
              {selectedId ? 'Save changes' : 'Create automation'}
            </Button>
          ) : null}
        </div>
      </header>
      {error ? <AuthMessage>{error}</AuthMessage> : null}
      {message ? <AuthMessage>{message}</AuthMessage> : null}
      <form
        className={`automation-editor${builderMode === 'visual' ? ' automation-editor--visual' : ''}`}
        id="automation-editor-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (canManage) void save();
        }}
      >
        <label className="automation-name-field" htmlFor="automation-name">
          <span>Automation name</span>
          <Input
            id="automation-name"
            placeholder="For example: High Value Qualified Lead"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>

        <div aria-label="Automation builder mode" className="automation-mode-switch" role="tablist">
          <button
            aria-selected={builderMode === 'visual'}
            onClick={() => {
              setGraphMetadata(
                builderMode === 'form'
                  ? graphFromRuleState(entityType, triggerType, triggerConfig, conditions, actions)
                  : (graphMetadata ??
                      graphFromRuleState(
                        entityType,
                        triggerType,
                        triggerConfig,
                        conditions,
                        actions,
                      )),
              );
              setBuilderMode('visual');
            }}
            role="tab"
            type="button"
          >
            Visual Builder
          </button>
          <button
            aria-selected={builderMode === 'form'}
            onClick={() => {
              const state = ruleStateFromGraph(
                graphMetadata ??
                  graphFromRuleState(entityType, triggerType, triggerConfig, conditions, actions),
              );
              setEntityType(state.entityType);
              setTriggerType(state.triggerType);
              setTriggerConfig(state.triggerConfig);
              setConditions(state.conditions);
              setActions(state.actions.length ? state.actions : [blankAction()]);
              setBuilderMode('form');
            }}
            role="tab"
            type="button"
          >
            Form Builder
          </button>
          {canReadRuns ? (
            <button
              aria-selected={builderMode === 'history'}
              onClick={() => setBuilderMode('history')}
              role="tab"
              type="button"
            >
              Run History
            </button>
          ) : null}
        </div>

        {builderMode === 'visual' ? (
          <AutomationVisualBuilder
            actions={actions}
            conditions={conditions}
            entityType={entityType}
            graphMetadata={graphMetadata}
            key={selectedId || 'new-automation'}
            references={references}
            setEntityType={setEntityType}
            setGraphMetadata={setGraphMetadata}
            triggerConfig={triggerConfig}
            triggerType={triggerType}
          />
        ) : builderMode === 'form' ? (
          <>
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
                        setConditions((items) =>
                          items.filter((_, itemIndex) => itemIndex !== index),
                        )
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
          </>
        ) : null}
      </form>

      {builderMode === 'history' ? (
        <div className="automation-run-history">
          <h3>Run history</h3>
          {!selectedId ? (
            <p>Save this automation before viewing its run history.</p>
          ) : runs.length ? (
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
                  <AutomationRunGraphSummary
                    graph={selectedRuleGraph ? ruleGraph(selectedRuleGraph) : graphMetadata}
                    run={run}
                  />
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
