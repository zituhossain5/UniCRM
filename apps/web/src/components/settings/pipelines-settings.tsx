'use client';

import { AuthMessage } from '@/components/auth-screen';
import { useCurrentUser } from '@/components/auth-provider';
import { apiRequest } from '@/lib/api';
import type { Pipeline } from '@/lib/crm-types';
import { Badge, Button, ConfirmationDialog, Dialog, Input, LoadingState } from '@unicrm/ui';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';

interface DraftStage {
  id?: string;
  name: string;
  isWon: boolean;
  isLost: boolean;
}
const initialStages: DraftStage[] = [
  { name: 'New Lead', isWon: false, isLost: false },
  { name: 'Qualified', isWon: false, isLost: false },
  { name: 'Won', isWon: true, isLost: false },
  { name: 'Lost', isWon: false, isLost: true },
];

export function PipelinesSettings() {
  const current = useCurrentUser();
  const [pipelines, setPipelines] = useState<Pipeline[]>();
  const [editing, setEditing] = useState<Pipeline>();
  const [stages, setStages] = useState<DraftStage[]>(initialStages);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const canManage = current.permissions.includes('pipeline.manage');
  async function load() {
    try {
      setPipelines((await apiRequest<{ data: Pipeline[] }>('/pipelines')).data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load pipelines.');
    }
  }
  useEffect(() => {
    void load();
  }, []);
  function edit(pipeline?: Pipeline) {
    setEditing(pipeline);
    setStages(
      pipeline
        ? pipeline.stages.map(({ id, name, isWon, isLost }) => ({ id, name, isWon, isLost }))
        : initialStages.map((stage) => ({ ...stage })),
    );
    setOpen(true);
  }
  function updateStage(index: number, patch: Partial<DraftStage>) {
    setStages((currentStages) =>
      currentStages.map((stage, position) => (position === index ? { ...stage, ...patch } : stage)),
    );
  }
  function chooseTerminal(index: number, terminal: 'isWon' | 'isLost') {
    setStages((currentStages) =>
      currentStages.map((stage, position) => ({
        ...stage,
        [terminal]: position === index,
        ...(position === index ? { [terminal === 'isWon' ? 'isLost' : 'isWon']: false } : {}),
      })),
    );
  }
  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= stages.length) return;
    const next = [...stages];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setStages(next);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const nameEntry = form.get('name');
    const name = typeof nameEntry === 'string' ? nameEntry : '';
    const isDefault = form.get('isDefault') === 'on';
    const ordered = stages.map((stage, position) => ({ ...stage, position }));
    try {
      if (editing) {
        await apiRequest(`/pipelines/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name, isDefault }),
        });
        await apiRequest(`/pipelines/${editing.id}/stages`, {
          method: 'PUT',
          body: JSON.stringify({ stages: ordered }),
        });
      } else {
        await apiRequest('/pipelines', {
          method: 'POST',
          body: JSON.stringify({ name, isDefault, stages: ordered }),
        });
      }
      setOpen(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save pipeline.');
    } finally {
      setBusy(false);
    }
  }
  async function archive(id: string) {
    try {
      await apiRequest(`/pipelines/${id}`, { method: 'DELETE' });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not archive pipeline.');
    }
  }
  if (!pipelines && !error) return <LoadingState label="Loading pipelines" />;
  return (
    <section className="settings-section settings-section--wide">
      <div className="settings-section-header">
        <header>
          <h2>Sales pipelines</h2>
          <p>Configure tenant-safe sales processes with explicit won and lost stages.</p>
        </header>
        {canManage ? (
          <Button onClick={() => edit()}>
            <Plus size={14} />
            New pipeline
          </Button>
        ) : null}
      </div>
      {error ? <AuthMessage>{error}</AuthMessage> : null}
      <div className="pipeline-settings-grid">
        {pipelines?.map((pipeline) => (
          <article className="pipeline-card" key={pipeline.id}>
            <header>
              <div>
                <strong>{pipeline.name}</strong>
                {pipeline.isDefault ? <Badge tone="primary">Default</Badge> : null}
              </div>
              {canManage ? (
                <div>
                  <Button onClick={() => edit(pipeline)} variant="ghost">
                    <Pencil size={14} />
                    Edit
                  </Button>
                  {!pipeline.isDefault ? (
                    <ConfirmationDialog
                      title="Archive pipeline?"
                      description="Only pipelines without active leads can be archived. Historical lead references remain intact."
                      confirmLabel="Archive"
                      onConfirm={() => void archive(pipeline.id)}
                      trigger={
                        <Button variant="ghost">
                          <Trash2 size={14} />
                          Archive
                        </Button>
                      }
                    />
                  ) : null}
                </div>
              ) : null}
            </header>
            <ol>
              {pipeline.stages.map((stage) => (
                <li key={stage.id}>
                  <span>{stage.name}</span>
                  {stage.isWon ? (
                    <Badge tone="success">Won</Badge>
                  ) : stage.isLost ? (
                    <Badge tone="danger">Lost</Badge>
                  ) : null}
                </li>
              ))}
            </ol>
          </article>
        ))}
      </div>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={editing ? 'Edit pipeline' : 'New pipeline'}
        description="Every pipeline must have exactly one won stage and one lost stage."
        trigger={<span hidden />}
      >
        <form className="dialog-form pipeline-editor" onSubmit={(event) => void save(event)}>
          <label>
            <span>Name</span>
            <Input defaultValue={editing?.name ?? ''} name="name" required maxLength={120} />
          </label>
          <label className="native-check">
            <input defaultChecked={editing?.isDefault ?? false} name="isDefault" type="checkbox" />
            <span>Default pipeline</span>
          </label>
          <div className="pipeline-stage-editor">
            <div className="pipeline-stage-heading">
              <span>Stages</span>
              <span>Won</span>
              <span>Lost</span>
              <span />
            </div>
            {stages.map((stage, index) => (
              <div className="pipeline-stage-row" key={stage.id ?? `new-${index}`}>
                <Input
                  aria-label={`Stage ${index + 1} name`}
                  value={stage.name}
                  onChange={(event) => updateStage(index, { name: event.target.value })}
                  required
                />
                <input
                  aria-label={`${stage.name} is won`}
                  checked={stage.isWon}
                  name="wonStage"
                  onChange={() => chooseTerminal(index, 'isWon')}
                  type="radio"
                />
                <input
                  aria-label={`${stage.name} is lost`}
                  checked={stage.isLost}
                  name="lostStage"
                  onChange={() => chooseTerminal(index, 'isLost')}
                  type="radio"
                />
                <div>
                  <Button
                    aria-label="Move stage up"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    variant="ghost"
                  >
                    <ArrowUp size={13} />
                  </Button>
                  <Button
                    aria-label="Move stage down"
                    disabled={index === stages.length - 1}
                    onClick={() => move(index, 1)}
                    variant="ghost"
                  >
                    <ArrowDown size={13} />
                  </Button>
                  <Button
                    aria-label="Remove stage"
                    disabled={stages.length <= 2}
                    onClick={() =>
                      setStages((items) => items.filter((_, position) => position !== index))
                    }
                    variant="ghost"
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <Button
            onClick={() =>
              setStages((items) => [
                ...items,
                { name: `Stage ${items.length + 1}`, isWon: false, isLost: false },
              ])
            }
            type="button"
            variant="outline"
          >
            <Plus size={14} />
            Add stage
          </Button>
          <Button loading={busy} type="submit">
            Save pipeline
          </Button>
        </form>
      </Dialog>
    </section>
  );
}
