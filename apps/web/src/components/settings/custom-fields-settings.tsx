'use client';

import { AuthMessage } from '@/components/auth-screen';
import { useCurrentUser } from '@/components/auth-provider';
import { apiRequest } from '@/lib/api';
import type {
  ConfigurableEntityType,
  CustomFieldDefinition,
  CustomFieldType,
} from '@/lib/configuration-types';
import { Badge, Button, Dialog, Input, LoadingState, Select } from '@unicrm/ui';
import { ArrowDown, ArrowUp, Pencil, Plus } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

const entities: ConfigurableEntityType[] = ['LEAD', 'COMPANY', 'CONTACT', 'PROJECT'];
const fieldTypes: Array<{ label: string; value: CustomFieldType }> = [
  ['Text', 'TEXT'],
  ['Long text', 'LONG_TEXT'],
  ['Number', 'NUMBER'],
  ['Currency', 'CURRENCY'],
  ['Date', 'DATE'],
  ['Boolean', 'BOOLEAN'],
  ['Select', 'SELECT'],
  ['Multi-select', 'MULTI_SELECT'],
  ['URL', 'URL'],
  ['Email', 'EMAIL'],
  ['Phone', 'PHONE'],
].map(([label, value]) => ({ label: label!, value: value as CustomFieldType }));

function customFieldKeyFromName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function CustomFieldsSettings() {
  const current = useCurrentUser();
  const [entityType, setEntityType] = useState<ConfigurableEntityType>('LEAD');
  const [fields, setFields] = useState<CustomFieldDefinition[]>();
  const [editing, setEditing] = useState<CustomFieldDefinition>();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [draftName, setDraftName] = useState('');
  const [draftKey, setDraftKey] = useState('');
  const [keyEdited, setKeyEdited] = useState(false);
  const canManage = current.permissions.includes('custom_field.manage');
  const load = useCallback(async () => {
    try {
      setFields(
        (
          await apiRequest<{ data: CustomFieldDefinition[] }>(
            `/custom-fields?entityType=${entityType}`,
          )
        ).data,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load custom fields.');
    }
  }, [entityType]);
  useEffect(() => {
    setFields(undefined);
    void load();
  }, [load]);
  function openNewField() {
    setEditing(undefined);
    setDraftName('');
    setDraftKey('');
    setKeyEdited(false);
    setOpen(true);
  }
  function openExistingField(field: CustomFieldDefinition) {
    setEditing(field);
    setDraftName(field.name);
    setDraftKey(field.key);
    setKeyEdited(true);
    setOpen(true);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const fieldType = data.get('fieldType');
    const type = (typeof fieldType === 'string' ? fieldType : 'TEXT') as CustomFieldType;
    const optionEntry = data.get('options');
    const options = typeof optionEntry === 'string' ? optionEntry : '';
    const payload = {
      ...(editing ? {} : { entityType }),
      name: data.get('name'),
      key: data.get('key'),
      fieldType: type,
      required: data.get('required') === 'on',
      active: editing ? data.get('active') === 'on' : undefined,
      options: ['SELECT', 'MULTI_SELECT'].includes(type)
        ? options
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean)
        : undefined,
    };
    try {
      await apiRequest(editing ? `/custom-fields/${editing.id}` : '/custom-fields', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      setOpen(false);
      setEditing(undefined);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save custom field.');
    }
  }
  async function move(index: number, direction: -1 | 1) {
    if (!fields) return;
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;
    const ordered = [...fields];
    [ordered[index], ordered[target]] = [ordered[target]!, ordered[index]!];
    try {
      setFields(ordered);
      await apiRequest(`/custom-fields/reorder/${entityType}`, {
        method: 'POST',
        body: JSON.stringify({
          fields: ordered.map((field, position) => ({ id: field.id, position })),
        }),
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not reorder fields.');
      await load();
    }
  }
  return (
    <section className="settings-section settings-section--wide">
      <div className="settings-section-header">
        <header>
          <h2>Custom fields</h2>
          <p>Add organization-defined information without database migrations.</p>
        </header>
        {canManage ? (
          <Button onClick={openNewField}>
            <Plus size={14} />
            New field
          </Button>
        ) : null}
      </div>
      <div className="crm-view-tabs">
        {entities.map((entity) => (
          <button
            aria-selected={entityType === entity}
            key={entity}
            onClick={() => setEntityType(entity)}
            type="button"
          >
            {entity[0] + entity.slice(1).toLowerCase()}
          </button>
        ))}
      </div>
      {error ? <AuthMessage>{error}</AuthMessage> : null}
      {!fields ? (
        <LoadingState label="Loading custom fields" />
      ) : (
        <div className="configuration-list">
          {fields.map((field, index) => (
            <div className="configuration-row configuration-row--details" key={field.id}>
              <div>
                <strong>{field.name}</strong>
                <span>
                  {field.key} · {fieldTypes.find(({ value }) => value === field.fieldType)?.label}
                  {field.required ? ' · Required' : ''}
                </span>
              </div>
              <div>
                {!field.active ? <Badge tone="neutral">Inactive</Badge> : null}
                {canManage ? (
                  <>
                    <Button
                      aria-label="Move up"
                      disabled={index === 0}
                      onClick={() => void move(index, -1)}
                      variant="ghost"
                    >
                      <ArrowUp size={14} />
                    </Button>
                    <Button
                      aria-label="Move down"
                      disabled={index === fields.length - 1}
                      onClick={() => void move(index, 1)}
                      variant="ghost"
                    >
                      <ArrowDown size={14} />
                    </Button>
                    <Button onClick={() => openExistingField(field)} variant="ghost">
                      <Pencil size={14} />
                      Edit
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
      {fields?.length === 0 ? (
        <p className="record-empty">No custom fields for this record type.</p>
      ) : null}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setEditing(undefined);
        }}
        title={editing ? 'Edit custom field' : 'New custom field'}
        trigger={<span hidden />}
      >
        <form className="dialog-form" onSubmit={(event) => void save(event)}>
          <label>
            <span>Name</span>
            <Input
              name="name"
              onChange={(event) => {
                const nextName = event.currentTarget.value;
                setDraftName(nextName);
                if (!editing && !keyEdited) setDraftKey(customFieldKeyFromName(nextName));
              }}
              required
              value={draftName}
            />
          </label>
          <label>
            <span>Key</span>
            <Input
              name="key"
              onChange={(event) => {
                setKeyEdited(true);
                setDraftKey(customFieldKeyFromName(event.currentTarget.value));
              }}
              pattern="[a-z][a-z0-9_]*"
              required
              value={draftKey}
            />
          </label>
          <Select
            defaultValue={editing?.fieldType ?? 'TEXT'}
            label="Type"
            name="fieldType"
            options={fieldTypes}
          />
          <label>
            <span>
              Options <small>(comma separated, select fields only)</small>
            </span>
            <Input defaultValue={editing?.options?.join(', ') ?? ''} name="options" />
          </label>
          <label className="native-check">
            <input defaultChecked={editing?.required ?? false} name="required" type="checkbox" />
            <span>Required</span>
          </label>
          {editing ? (
            <label className="native-check">
              <input defaultChecked={editing.active} name="active" type="checkbox" />
              <span>Active</span>
            </label>
          ) : null}
          <Button type="submit">Save field</Button>
        </form>
      </Dialog>
    </section>
  );
}
