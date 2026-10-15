'use client';

import { AuthMessage } from '@/components/auth-screen';
import { apiBaseUrl, apiRequest } from '@/lib/api';
import type {
  WebToLeadIntegration,
  WebToLeadLog,
  WebToLeadMapping,
  WebToLeadReferences,
} from '@/lib/integration-types';
import { Button, Input, LoadingState, Select } from '@unicrm/ui';
import { Check, Copy, Plus, RotateCcw, Send, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

const sourceOptions = [
  'name',
  'firstName',
  'lastName',
  'fullName',
  'email',
  'phone',
  'company',
  'subject',
  'message',
  'service',
  'budget',
  'sourceUrl',
  'referrer',
  'utmSource',
  'utmMedium',
  'utmCampaign',
  'submittedAt',
  'estimatedValue',
  'priority',
].map((value) => ({ label: value, value }));

const targetOptions = [
  'CONTACT_FULL_NAME',
  'CONTACT_FIRST_NAME',
  'CONTACT_LAST_NAME',
  'CONTACT_EMAIL',
  'CONTACT_PHONE',
  'COMPANY_NAME',
  'LEAD_TITLE',
  'LEAD_EMAIL',
  'LEAD_PHONE',
  'LEAD_DESCRIPTION',
  'LEAD_ESTIMATED_VALUE',
  'LEAD_PRIORITY',
  'LEAD_CUSTOM_FIELD',
  'LEAD_TAG',
].map((value) => ({ label: value.replaceAll('_', ' ').toLowerCase(), value }));

const emptyMapping = (): WebToLeadMapping => ({ sourceField: 'email', target: 'LEAD_EMAIL' });

export function WebToLeadSettings({
  canManage,
  canReadLogs,
}: {
  canManage: boolean;
  canReadLogs: boolean;
}) {
  const [items, setItems] = useState<WebToLeadIntegration[]>();
  const [references, setReferences] = useState<WebToLeadReferences>();
  const [logs, setLogs] = useState<WebToLeadLog[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [editingId, setEditingId] = useState<string>();
  const [name, setName] = useState('');
  const [sourceKey, setSourceKey] = useState('website');
  const [pipelineId, setPipelineId] = useState('');
  const [stageId, setStageId] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [tagToAdd, setTagToAdd] = useState('');
  const [mappings, setMappings] = useState<WebToLeadMapping[]>([emptyMapping()]);
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState('');

  const stages = useMemo(
    () => references?.pipelines.find((pipeline) => pipeline.id === pipelineId)?.stages ?? [],
    [pipelineId, references],
  );

  async function load() {
    setError('');
    try {
      const [itemResponse, referenceResponse] = await Promise.all([
        apiRequest<{ data: WebToLeadIntegration[] }>('/integrations/web-to-lead'),
        apiRequest<{ data: WebToLeadReferences }>('/integrations/web-to-lead/references'),
      ]);
      setItems(itemResponse.data);
      setReferences(referenceResponse.data);
      const firstPipeline = referenceResponse.data.pipelines[0];
      setPipelineId((value) => value || firstPipeline?.id || '');
      setStageId((value) => value || firstPipeline?.stages[0]?.id || '');
      setSelectedId((value) => value || itemResponse.data[0]?.id || '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load Web-to-Lead settings.');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!selectedId || !canReadLogs) return;
    void apiRequest<{ data: WebToLeadLog[] }>(`/integrations/web-to-lead/${selectedId}/logs`)
      .then((response) => setLogs(response.data))
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'Could not load submission logs.'),
      );
  }, [canReadLogs, selectedId]);

  function resetForm() {
    const firstPipeline = references?.pipelines[0];
    setEditingId(undefined);
    setName('');
    setSourceKey('website');
    setPipelineId(firstPipeline?.id ?? '');
    setStageId(firstPipeline?.stages[0]?.id ?? '');
    setOwnerId('');
    setPriority('MEDIUM');
    setTagIds([]);
    setMappings([emptyMapping()]);
  }

  function edit(item: WebToLeadIntegration) {
    setEditingId(item.id);
    setName(item.connection.name.replace(/^Web-to-Lead: /, ''));
    setSourceKey(item.sourceKey);
    setPipelineId(item.defaultPipelineId);
    setStageId(item.defaultStageId);
    setOwnerId(item.defaultOwnerId ?? '');
    setPriority(item.defaultPriority);
    setTagIds(item.defaultTagIds);
    setMappings(item.mappings.length ? item.mappings : [emptyMapping()]);
  }

  async function save() {
    setSaving(true);
    setError('');
    setMessage('');
    setSecret('');
    try {
      const payload = {
        name,
        sourceKey,
        defaultPipelineId: pipelineId,
        defaultStageId: stageId,
        ...(ownerId ? { defaultOwnerId: ownerId } : editingId ? { clearDefaultOwner: true } : {}),
        defaultPriority: priority,
        defaultTagIds: tagIds,
        mappings,
      };
      if (editingId) {
        await apiRequest(`/integrations/web-to-lead/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        setMessage('Web-to-Lead integration updated.');
      } else {
        const response = await apiRequest<{ data: WebToLeadIntegration & { secret: string } }>(
          '/integrations/web-to-lead',
          { method: 'POST', body: JSON.stringify(payload) },
        );
        setSecret(response.data.secret);
        setMessage('Integration created. Copy the secret now; it will not be shown again.');
      }
      await load();
      resetForm();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save Web-to-Lead integration.');
    } finally {
      setSaving(false);
    }
  }

  async function updateActive(item: WebToLeadIntegration) {
    setError('');
    try {
      await apiRequest(`/integrations/web-to-lead/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !item.active }),
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update integration.');
    }
  }

  async function rotate(item: WebToLeadIntegration) {
    if (
      !window.confirm(
        `Rotate the secret for ${item.connection.name}? Existing forms will stop working until updated.`,
      )
    )
      return;
    setError('');
    setSecret('');
    try {
      const response = await apiRequest<{ data: { secret: string } }>(
        `/integrations/web-to-lead/${item.id}/rotate-secret`,
        { method: 'POST' },
      );
      setSecret(response.data.secret);
      setMessage('Secret rotated. Copy the replacement now.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not rotate secret.');
    }
  }

  async function test(item: WebToLeadIntegration) {
    setError('');
    setMessage('');
    try {
      await apiRequest(`/integrations/web-to-lead/${item.id}/test`, {
        method: 'POST',
        body: JSON.stringify({
          submissionId: `test-${Date.now()}`,
          fullName: 'Web-to-Lead Test',
          email: 'web-to-lead-test@example.com',
          subject: 'Web-to-Lead test submission',
          message: 'Created from the UniCRM integration test tool.',
        }),
      });
      setMessage('Test submission accepted and processed.');
      setSelectedId(item.id);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Test submission failed.');
    }
  }

  async function copy(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(''), 1800);
  }

  function changeMapping(index: number, patch: Partial<WebToLeadMapping>) {
    setMappings((current) =>
      current.map((mapping, position) => (position === index ? { ...mapping, ...patch } : mapping)),
    );
  }

  if (!items || !references) return <LoadingState label="Loading Web-to-Lead integrations" />;

  return (
    <div className="web-to-lead-settings">
      {error ? <AuthMessage>{error}</AuthMessage> : null}
      {message ? <AuthMessage>{message}</AuthMessage> : null}
      {secret ? (
        <div className="web-to-lead-secret" role="status">
          <strong>Signing secret (shown once)</strong>
          <code>{secret}</code>
          <Button onClick={() => void copy(secret, 'secret')} type="button" variant="secondary">
            <Copy size={14} /> {copied === 'secret' ? 'Copied' : 'Copy secret'}
          </Button>
        </div>
      ) : null}

      {canManage ? (
        <section
          className="web-to-lead-editor"
          aria-label={editingId ? 'Edit Web-to-Lead integration' : 'Create Web-to-Lead integration'}
        >
          <div className="web-to-lead-section-heading">
            <div>
              <strong>{editingId ? 'Edit integration' : 'New Web-to-Lead integration'}</strong>
              <small>Configure CRM defaults and map only approved input fields.</small>
            </div>
            {editingId ? (
              <Button onClick={resetForm} type="button" variant="secondary">
                Cancel edit
              </Button>
            ) : null}
          </div>
          <div className="web-to-lead-form-grid">
            <label>
              Name
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Website contact form"
              />
            </label>
            <label>
              Source key
              <Input
                value={sourceKey}
                onChange={(event) =>
                  setSourceKey(event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))
                }
                placeholder="main_website"
              />
            </label>
            <Select
              label="Default pipeline"
              value={pipelineId}
              onValueChange={(value) => {
                const next = value ?? '';
                setPipelineId(next);
                setStageId(
                  references.pipelines.find((pipeline) => pipeline.id === next)?.stages[0]?.id ??
                    '',
                );
              }}
              options={references.pipelines.map((pipeline) => ({
                label: pipeline.name,
                value: pipeline.id,
              }))}
            />
            <Select
              label="Default stage"
              value={stageId}
              onValueChange={(value) => setStageId(value ?? '')}
              options={stages.map((stage) => ({ label: stage.name, value: stage.id }))}
            />
            <Select
              label="Default owner"
              value={ownerId}
              onValueChange={(value) => setOwnerId(value ?? '')}
              placeholder="Unassigned"
              options={references.users.map((user) => ({
                label: `${user.firstName} ${user.lastName}`,
                value: user.id,
              }))}
            />
            <Select
              label="Default priority"
              value={priority}
              onValueChange={(value) => setPriority(value ?? 'MEDIUM')}
              options={['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((value) => ({
                label: value,
                value,
              }))}
            />
          </div>
          <div className="web-to-lead-tag-picker">
            <Select
              label="Default tags"
              value={tagToAdd}
              onValueChange={(value) => setTagToAdd(value ?? '')}
              placeholder="Select a tag"
              options={references.tags
                .filter((tag) => !tagIds.includes(tag.id))
                .map((tag) => ({ label: tag.name, value: tag.id }))}
            />
            <Button
              disabled={!tagToAdd}
              onClick={() => {
                setTagIds((current) => [...new Set([...current, tagToAdd])]);
                setTagToAdd('');
              }}
              type="button"
              variant="secondary"
            >
              <Plus size={14} /> Add
            </Button>
          </div>
          {tagIds.length ? (
            <div className="web-to-lead-chips">
              {tagIds.map((id) => (
                <button
                  key={id}
                  onClick={() => setTagIds((current) => current.filter((value) => value !== id))}
                  type="button"
                >
                  {references.tags.find((tag) => tag.id === id)?.name ?? id} ×
                </button>
              ))}
            </div>
          ) : null}
          <div className="web-to-lead-mappings">
            <div className="web-to-lead-section-heading">
              <div>
                <strong>Field mappings</strong>
                <small>
                  Canonical fields work automatically; mappings override or extend them.
                </small>
              </div>
              <Button
                onClick={() => setMappings((current) => [...current, emptyMapping()])}
                type="button"
                variant="secondary"
              >
                <Plus size={14} /> Add mapping
              </Button>
            </div>
            {mappings.map((mapping, index) => {
              const referenceOptions =
                mapping.target === 'LEAD_CUSTOM_FIELD'
                  ? references.customFields.map((field) => ({ label: field.name, value: field.id }))
                  : mapping.target === 'LEAD_TAG'
                    ? references.tags.map((tag) => ({ label: tag.name, value: tag.id }))
                    : [];
              const fixedValue =
                typeof mapping.fixedValue === 'string' ||
                typeof mapping.fixedValue === 'number' ||
                typeof mapping.fixedValue === 'boolean'
                  ? String(mapping.fixedValue)
                  : '';
              return (
                <div className="web-to-lead-mapping-row" key={`${index}-${mapping.target}`}>
                  <Select
                    label="Source"
                    value={mapping.sourceField ?? '__fixed'}
                    onValueChange={(value) =>
                      changeMapping(
                        index,
                        value === '__fixed'
                          ? { sourceField: undefined, fixedValue: '' }
                          : { sourceField: value ?? 'email', fixedValue: undefined },
                      )
                    }
                    options={[...sourceOptions, { label: 'Fixed value', value: '__fixed' }]}
                  />
                  {mapping.sourceField === undefined ? (
                    <label>
                      Fixed value
                      <Input
                        value={fixedValue}
                        onChange={(event) =>
                          changeMapping(index, { fixedValue: event.target.value })
                        }
                      />
                    </label>
                  ) : null}
                  <Select
                    label="Target"
                    value={mapping.target}
                    onValueChange={(value) =>
                      changeMapping(index, { target: value ?? 'LEAD_EMAIL', targetId: undefined })
                    }
                    options={targetOptions}
                  />
                  {referenceOptions.length ? (
                    <Select
                      label="Target field"
                      value={mapping.targetId}
                      onValueChange={(value) =>
                        changeMapping(index, { targetId: value ?? undefined })
                      }
                      options={referenceOptions}
                      placeholder="Select target"
                    />
                  ) : null}
                  <Button
                    aria-label="Remove mapping"
                    onClick={() =>
                      setMappings((current) => current.filter((_, position) => position !== index))
                    }
                    type="button"
                    variant="secondary"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              );
            })}
          </div>
          <Button
            disabled={saving || !name || !sourceKey || !pipelineId || !stageId}
            onClick={() => void save()}
            type="button"
          >
            {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create integration'}
          </Button>
        </section>
      ) : null}

      <div className="web-to-lead-card-list">
        {items.length === 0 ? (
          <div className="configuration-row">No Web-to-Lead integrations yet.</div>
        ) : (
          items.map((item) => {
            const endpoint = `${apiBaseUrl()}${item.endpoint}`;
            return (
              <article className="web-to-lead-card" key={item.id}>
                <header>
                  <div>
                    <strong>{item.connection.name.replace(/^Web-to-Lead: /, '')}</strong>
                    <small>
                      {item.sourceKey} · {item.defaultPipeline.name} / {item.defaultStage.name}
                    </small>
                  </div>
                  <span>{item.active ? 'ACTIVE' : 'DISABLED'}</span>
                </header>
                <div className="web-to-lead-endpoint">
                  <code>{endpoint}</code>
                  <Button
                    aria-label="Copy endpoint"
                    onClick={() => void copy(endpoint, item.id)}
                    type="button"
                    variant="secondary"
                  >
                    {copied === item.id ? <Check size={14} /> : <Copy size={14} />}
                  </Button>
                </div>
                <div className="settings-meta">
                  <span>Accepted: {item.successfulSubmissions}</span>
                  <span>Failed: {item.failedSubmissions}</span>
                  <span>
                    Last submission:{' '}
                    {item.lastSubmissionAt
                      ? new Date(item.lastSubmissionAt).toLocaleString()
                      : 'Never'}
                  </span>
                  <span>Secret: ••••{item.connection.secretLastFour}</span>
                </div>
                {canManage ? (
                  <footer>
                    <Button onClick={() => edit(item)} type="button" variant="secondary">
                      Edit
                    </Button>
                    <Button onClick={() => void test(item)} type="button" variant="secondary">
                      <Send size={14} /> Test
                    </Button>
                    <Button onClick={() => void rotate(item)} type="button" variant="secondary">
                      <RotateCcw size={14} /> Rotate secret
                    </Button>
                    <Button
                      onClick={() => void updateActive(item)}
                      type="button"
                      variant="secondary"
                    >
                      {item.active ? 'Disable' : 'Enable'}
                    </Button>
                  </footer>
                ) : null}
              </article>
            );
          })
        )}
      </div>

      {canReadLogs && items.length ? (
        <section className="web-to-lead-logs">
          <Select
            label="Submission log"
            value={selectedId}
            onValueChange={(value) => setSelectedId(value ?? '')}
            options={items.map((item) => ({
              label: item.connection.name.replace(/^Web-to-Lead: /, ''),
              value: item.id,
            }))}
          />
          <div className="configuration-list">
            {logs.length ? (
              logs.map((log) => (
                <div className="configuration-row configuration-row--details" key={log.id}>
                  <div>
                    <strong>{log.submissionId ?? 'Submission'}</strong>
                    <small>
                      {new Date(log.receivedAt).toLocaleString()} · attempts{' '}
                      {log.event.attemptCount}
                      {log.leadId ? ` · Lead ${log.leadId}` : ''}
                    </small>
                    {log.lastError ? <small>{log.lastError}</small> : null}
                  </div>
                  <span>{log.status}</span>
                </div>
              ))
            ) : (
              <div className="configuration-row">No submissions yet.</div>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
