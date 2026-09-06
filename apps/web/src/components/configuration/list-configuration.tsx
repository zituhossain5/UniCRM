'use client';

import { AuthMessage } from '@/components/auth-screen';
import { useCurrentUser } from '@/components/auth-provider';
import { apiRequest } from '@/lib/api';
import type {
  ConfigurableEntityType,
  CustomFieldDefinition,
  SavedView,
  SavedViewEntityType,
} from '@/lib/configuration-types';
import { Button, Dialog, Input, Select } from '@unicrm/ui';
import { Bookmark, Save, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRecordConfiguration } from './record-configuration';

export function MetadataListControls({
  entityType,
  tag,
  onTagChange,
  customFields,
  onCustomFieldsChange,
}: {
  entityType: ConfigurableEntityType;
  tag: string;
  onTagChange: (value: string) => void;
  customFields: Record<string, unknown>;
  onCustomFieldsChange: (value: Record<string, unknown>) => void;
}) {
  const { definitions, tags } = useRecordConfiguration(entityType);
  const filterable = definitions.filter(
    (definition) => definition.fieldType !== 'LONG_TEXT' && definition.fieldType !== 'MULTI_SELECT',
  );
  const selectedKey = Object.keys(customFields)[0] ?? '';
  const definition = filterable.find(({ key }) => key === selectedKey);
  const rawValue = selectedKey ? customFields[selectedKey] : '';
  return (
    <>
      {tags.length ? (
        <Select
          value={tag || null}
          onValueChange={(value) => onTagChange(value ?? '')}
          options={[
            { label: 'All tags', value: '' },
            ...tags.map((item) => ({ label: item.name, value: item.id })),
          ]}
          placeholder="Tag"
        />
      ) : null}
      {filterable.length ? (
        <Select
          value={selectedKey || null}
          onValueChange={(value) => onCustomFieldsChange(value ? { [value]: '' } : {})}
          options={[
            { label: 'No custom filter', value: '' },
            ...filterable.map((field) => ({ label: field.name, value: field.key })),
          ]}
          placeholder="Custom field"
        />
      ) : null}
      {definition ? (
        <CustomFilterValue
          definition={definition}
          value={rawValue}
          onChange={(value) => onCustomFieldsChange({ [definition.key]: value })}
        />
      ) : null}
    </>
  );
}

function CustomFilterValue({
  definition,
  value,
  onChange,
}: {
  definition: CustomFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (definition.fieldType === 'BOOLEAN')
    return (
      <Select
        value={typeof value === 'boolean' ? String(value) : null}
        onValueChange={(next) => onChange(next === 'true')}
        options={[
          { label: 'Yes', value: 'true' },
          { label: 'No', value: 'false' },
        ]}
        placeholder="Value"
      />
    );
  if (definition.fieldType === 'SELECT')
    return (
      <Select
        value={typeof value === 'string' ? value || null : null}
        onValueChange={(next) => onChange(next ?? '')}
        options={(definition.options ?? []).map((option) => ({ label: option, value: option }))}
        placeholder="Value"
      />
    );
  return (
    <Input
      aria-label={`${definition.name} filter`}
      className="metadata-filter-input"
      placeholder="Filter value"
      type={
        definition.fieldType === 'NUMBER' || definition.fieldType === 'CURRENCY'
          ? 'number'
          : definition.fieldType === 'DATE'
            ? 'date'
            : 'text'
      }
      value={typeof value === 'string' || typeof value === 'number' ? String(value) : ''}
      onChange={(event) =>
        onChange(
          definition.fieldType === 'NUMBER' || definition.fieldType === 'CURRENCY'
            ? Number(event.target.value)
            : event.target.value,
        )
      }
    />
  );
}

export function SavedViewsBar({
  entityType,
  filters,
  sort,
  onApply,
}: {
  entityType: SavedViewEntityType;
  filters: Record<string, unknown>;
  sort: { field: string; order: 'asc' | 'desc' };
  onApply: (filters: Record<string, unknown>, sort: SavedView['sort']) => void;
}) {
  const current = useCurrentUser();
  const [views, setViews] = useState<SavedView[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const selected = useMemo(() => views.find(({ id }) => id === selectedId), [selectedId, views]);
  const canCreate = current.permissions.includes('saved_view.create');
  const canUpdate = current.permissions.includes('saved_view.update');
  const canDelete = current.permissions.includes('saved_view.delete');
  async function load() {
    try {
      setViews(
        (await apiRequest<{ data: SavedView[] }>(`/saved-views?entityType=${entityType}`)).data,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load saved views.');
    }
  }
  useEffect(() => {
    void load();
  }, [entityType]);
  useEffect(() => {
    const defaultView = views.find((view) => view.isDefault);
    if (defaultView && !selectedId) {
      setSelectedId(defaultView.id);
      onApply(defaultView.filters, defaultView.sort);
    }
  }, [onApply, selectedId, views]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const name = form.get('name');
    const payload = {
      ...(selected ? {} : { entityType }),
      name: typeof name === 'string' ? name : '',
      filters: cleanFilters(filters),
      sort,
      columns: null,
      visibility: form.get('visibility'),
      isDefault: form.get('isDefault') === 'on',
    };
    try {
      const result = selected
        ? await apiRequest<{ data: SavedView }>(`/saved-views/${selected.id}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          })
        : await apiRequest<{ data: SavedView }>('/saved-views', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
      setSelectedId(result.data.id);
      setOpen(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save view.');
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!selected) return;
    setBusy(true);
    try {
      await apiRequest(`/saved-views/${selected.id}`, { method: 'DELETE' });
      setSelectedId('');
      setOpen(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete view.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="saved-views-bar">
      <Bookmark size={15} />
      <Select
        value={selectedId || null}
        onValueChange={(id) => {
          setSelectedId(id ?? '');
          const view = views.find((item) => item.id === id);
          if (view) onApply(view.filters, view.sort);
        }}
        options={[
          { label: 'Saved views', value: '' },
          ...views.map((view) => ({
            label: `${view.isDefault ? 'Default: ' : ''}${view.name}${view.visibility === 'ORGANIZATION' ? ' - Team' : ''}`,
            value: view.id,
          })),
        ]}
        placeholder="Saved views"
      />
      {(selected ? canUpdate : canCreate) ? (
        <Dialog
          open={open}
          onOpenChange={setOpen}
          title={selected ? 'Update saved view' : 'Save current view'}
          trigger={
            <Button variant="outline">
              <Save size={14} />
              {selected ? 'Update view' : 'Save view'}
            </Button>
          }
        >
          <form className="dialog-form" onSubmit={(event) => void save(event)}>
            {error ? <AuthMessage>{error}</AuthMessage> : null}
            <label>
              <span>Name</span>
              <Input defaultValue={selected?.name ?? ''} name="name" required maxLength={120} />
            </label>
            <Select
              defaultValue={selected?.visibility ?? 'PRIVATE'}
              label="Visibility"
              name="visibility"
              options={[
                { label: 'Private', value: 'PRIVATE' },
                { label: 'Organization', value: 'ORGANIZATION' },
              ]}
            />
            <label className="native-check">
              <input
                defaultChecked={selected?.isDefault ?? false}
                name="isDefault"
                type="checkbox"
              />
              <span>Use as my default view</span>
            </label>
            <div className="dialog-actions">
              <Button loading={busy} type="submit">
                {selected ? 'Update' : 'Save'}
              </Button>
              {selected && canDelete ? (
                <Button disabled={busy} onClick={() => void remove()} type="button" variant="ghost">
                  <Trash2 size={14} />
                  Delete
                </Button>
              ) : null}
            </div>
          </form>
        </Dialog>
      ) : null}
      {selected && canUpdate ? (
        <span className="saved-view-hint">Current filters can update this view.</span>
      ) : null}
      {error && !open ? <span className="saved-view-error">{error}</span> : null}
    </div>
  );
}

function cleanFilters(filters: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => {
      if (value === '' || value === null || value === undefined) return false;
      if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0)
        return false;
      return true;
    }),
  );
}
