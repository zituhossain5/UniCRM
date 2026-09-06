'use client';

import { useCurrentUser } from '@/components/auth-provider';
import { apiRequest } from '@/lib/api';
import type {
  ConfigurableEntityType,
  CustomFieldDefinition,
  CustomFieldEntry,
  Tag,
} from '@/lib/configuration-types';
import { Badge, Input, Select, Textarea } from '@unicrm/ui';
import { useEffect, useMemo, useState } from 'react';

export function useRecordConfiguration(entityType: ConfigurableEntityType, enabled = true) {
  const [definitions, setDefinitions] = useState<CustomFieldDefinition[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!enabled) return;
    void Promise.allSettled([
      apiRequest<{ data: CustomFieldDefinition[] }>(
        `/custom-fields?entityType=${entityType}&active=true`,
      ),
      apiRequest<{ data: Tag[] }>('/tags'),
    ]).then(([fields, tagResult]) => {
      if (fields.status === 'fulfilled') setDefinitions(fields.value.data);
      if (tagResult.status === 'fulfilled') setTags(tagResult.value.data);
      if (fields.status === 'rejected' && tagResult.status === 'rejected')
        setError('Could not load additional information.');
    });
  }, [enabled, entityType]);
  return { definitions, tags, error };
}

export function AdditionalInformationFields({
  definitions,
  entries = [],
  tags,
  selectedTags = [],
}: {
  definitions: CustomFieldDefinition[];
  entries?: CustomFieldEntry[];
  tags: Tag[];
  selectedTags?: Tag[];
}) {
  const values = useMemo(
    () => new Map(entries.map((entry) => [entry.definition.key, entry.value])),
    [entries],
  );
  if (!definitions.length && !tags.length) return null;
  return (
    <fieldset className="additional-information">
      <legend>Additional information</legend>
      {definitions.map((definition) => (
        <CustomFieldInput
          definition={definition}
          key={definition.id}
          value={values.get(definition.key)}
        />
      ))}
      {tags.length ? (
        <div className="tag-choice-field">
          <span>Tags</span>
          <div className="tag-choice-list">
            {tags.map((tag) => (
              <label className="native-check" key={tag.id}>
                <input
                  defaultChecked={selectedTags.some(({ id }) => id === tag.id)}
                  name="tagIds"
                  type="checkbox"
                  value={tag.id}
                />
                <span>{tag.name}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </fieldset>
  );
}

function CustomFieldInput({
  definition,
  value,
}: {
  definition: CustomFieldDefinition;
  value: unknown;
}) {
  const name = `customField:${definition.key}`;
  const common = { name, required: definition.required };
  if (definition.fieldType === 'LONG_TEXT')
    return (
      <label>
        <span>{definition.name}</span>
        <Textarea {...common} defaultValue={typeof value === 'string' ? value : ''} />
      </label>
    );
  if (definition.fieldType === 'BOOLEAN')
    return (
      <label className="native-check">
        <input {...common} defaultChecked={value === true} type="checkbox" />
        <span>{definition.name}</span>
      </label>
    );
  if (definition.fieldType === 'SELECT')
    return (
      <Select
        {...common}
        defaultValue={typeof value === 'string' ? value : undefined}
        label={definition.name}
        options={(definition.options ?? []).map((option) => ({ label: option, value: option }))}
        placeholder="Select an option"
      />
    );
  if (definition.fieldType === 'MULTI_SELECT') {
    const selected = Array.isArray(value) ? value : [];
    return (
      <div className="tag-choice-field">
        <span>{definition.name}</span>
        <div className="tag-choice-list">
          {(definition.options ?? []).map((option) => (
            <label className="native-check" key={option}>
              <input
                defaultChecked={selected.includes(option)}
                name={name}
                type="checkbox"
                value={option}
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
      </div>
    );
  }
  const type =
    definition.fieldType === 'NUMBER' || definition.fieldType === 'CURRENCY'
      ? 'number'
      : definition.fieldType === 'DATE'
        ? 'date'
        : definition.fieldType === 'URL'
          ? 'url'
          : definition.fieldType === 'EMAIL'
            ? 'email'
            : definition.fieldType === 'PHONE'
              ? 'tel'
              : 'text';
  return (
    <label>
      <span>{definition.name}</span>
      <Input
        {...common}
        defaultValue={typeof value === 'string' || typeof value === 'number' ? String(value) : ''}
        step={definition.fieldType === 'CURRENCY' ? '0.01' : undefined}
        type={type}
      />
    </label>
  );
}

export function configurationPayload(form: HTMLFormElement, definitions: CustomFieldDefinition[]) {
  const data = new FormData(form);
  const customFields: Record<string, unknown> = {};
  for (const definition of definitions) {
    const name = `customField:${definition.key}`;
    if (definition.fieldType === 'BOOLEAN') customFields[definition.key] = data.has(name);
    else if (definition.fieldType === 'MULTI_SELECT')
      customFields[definition.key] = data.getAll(name).map(String);
    else {
      const raw = data.get(name);
      customFields[definition.key] =
        raw === null || raw === ''
          ? null
          : definition.fieldType === 'NUMBER' || definition.fieldType === 'CURRENCY'
            ? Number(raw)
            : typeof raw === 'string'
              ? raw
              : null;
    }
  }
  return { customFields, tagIds: data.getAll('tagIds').map(String) };
}

export function configurableRecordPayload(
  form: HTMLFormElement,
  definitions: CustomFieldDefinition[],
  options: { includeEmptyValues?: boolean } = {},
) {
  const data = new FormData(form);
  const standardFields = Object.fromEntries(
    [...data.entries()].filter(
      ([key, value]) =>
        key !== 'tagIds' &&
        !key.startsWith('customField:') &&
        (options.includeEmptyValues || value !== ''),
    ),
  );
  return { ...standardFields, ...configurationPayload(form, definitions) };
}

export function RecordMetadataSummary({
  entries = [],
  tags = [],
}: {
  entries?: CustomFieldEntry[];
  tags?: Tag[];
}) {
  const current = useCurrentUser();
  if (!entries.length && !tags.length) return null;
  return (
    <section className="record-section record-metadata-section">
      <h2>Additional information</h2>
      {tags.length ? (
        <div className="record-tags">
          {tags.map((tag) => (
            <Badge key={tag.id} tone="neutral">
              {tag.name}
            </Badge>
          ))}
        </div>
      ) : null}
      {entries.length ? (
        <dl className="detail-list">
          {entries.map(({ definition, value }) => (
            <div key={definition.id}>
              <dt>
                {definition.name}
                {definition.active ? '' : ' (inactive)'}
              </dt>
              <dd>
                {formatCustomValue(
                  definition.fieldType,
                  value,
                  current.organization.defaultCurrency,
                )}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}

function formatCustomValue(
  fieldType: CustomFieldDefinition['fieldType'],
  value: unknown,
  currency: string,
) {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.join(', ') || '-';
  if (typeof value === 'string') return value || '-';
  if (typeof value === 'number')
    return fieldType === 'CURRENCY'
      ? new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value)
      : value.toLocaleString();
  return '-';
}
