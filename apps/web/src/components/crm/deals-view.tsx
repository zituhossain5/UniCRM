'use client';

import { useCurrentUser } from '@/components/auth-provider';
import {
  AdditionalInformationFields,
  configurableRecordPayload,
  useRecordConfiguration,
} from '@/components/configuration/record-configuration';
import { MetadataListControls, SavedViewsBar } from '@/components/configuration/list-configuration';
import { apiRequest } from '@/lib/api';
import { emitCrmDataChanged } from '@/lib/crm-events';
import { useCrmReferenceData, userOptions } from '@/lib/crm-reference-data';
import {
  formatMoney,
  labelize,
  leadPriorities,
  personName,
  type DealRecord,
  type PaginationMeta,
  type Pipeline,
} from '@/lib/crm-types';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  PageHeader,
  Pagination,
  Select,
  Sheet,
  Textarea,
} from '@unicrm/ui';
import { Handshake, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react';

const views = ['open', 'mine', 'won', 'lost', 'all'] as const;

export function DealsView() {
  const current = useCurrentUser();
  const [deals, setDeals] = useState<DealRecord[]>();
  const [meta, setMeta] = useState<PaginationMeta>({ page: 1, limit: 25, total: 0, totalPages: 1 });
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [view, setView] = useState('open');
  const [mode, setMode] = useState<'table' | 'board'>('table');
  const [search, setSearch] = useState('');
  const [pipeline, setPipeline] = useState('');
  const [stage, setStage] = useState('');
  const [owner, setOwner] = useState('');
  const [priority, setPriority] = useState('');
  const [tag, setTag] = useState('');
  const [customFields, setCustomFields] = useState<Record<string, unknown>>({});
  const [sorting, setSorting] = useState('createdAt:desc');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const { users } = useCrmReferenceData({ users: current.permissions.includes('user.read') });

  const load = useCallback(async () => {
    try {
      setError('');
      const [sort, order] = sorting.split(':');
      const params = new URLSearchParams({
        page: String(page),
        limit: '25',
        view,
        sort: sort!,
        order: order!,
      });
      if (search.trim()) params.set('search', search.trim());
      if (pipeline) params.set('pipeline', pipeline);
      if (stage) params.set('stage', stage);
      if (owner) params.set('owner', owner);
      if (priority) params.set('priority', priority);
      if (tag) params.set('tag', tag);
      if (
        Object.keys(customFields).length &&
        Object.values(customFields).every((value) => value !== '')
      )
        params.set('customFields', JSON.stringify(customFields));
      const result = await apiRequest<{ data: DealRecord[]; meta: PaginationMeta }>(
        `/deals?${params}`,
      );
      setDeals(result.data);
      setMeta(result.meta);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load deals.');
    }
  }, [customFields, owner, page, pipeline, priority, search, sorting, stage, tag, view]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    void apiRequest<{ data: Pipeline[] }>('/pipelines?entityType=DEAL')
      .then((result) => setPipelines(result.data))
      .catch(() => undefined);
  }, []);
  const stages = pipeline
    ? (pipelines.find(({ id }) => id === pipeline)?.stages ?? [])
    : pipelines.flatMap(({ stages: values }) => values);
  const [sortField, sortOrder] = sorting.split(':') as [string, 'asc' | 'desc'];
  const applySavedView = useCallback(
    (
      filters: Record<string, unknown>,
      savedSort: { field: string; order: 'asc' | 'desc' } | null,
    ) => {
      setSearch(typeof filters.search === 'string' ? filters.search : '');
      setView(typeof filters.view === 'string' ? filters.view : 'open');
      setPipeline(typeof filters.pipeline === 'string' ? filters.pipeline : '');
      setStage(typeof filters.stage === 'string' ? filters.stage : '');
      setOwner(typeof filters.owner === 'string' ? filters.owner : '');
      setPriority(typeof filters.priority === 'string' ? filters.priority : '');
      setTag(typeof filters.tag === 'string' ? filters.tag : '');
      setCustomFields(
        filters.customFields &&
          typeof filters.customFields === 'object' &&
          !Array.isArray(filters.customFields)
          ? (filters.customFields as Record<string, unknown>)
          : {},
      );
      if (savedSort) setSorting(`${savedSort.field}:${savedSort.order}`);
      setPage(1);
    },
    [],
  );

  return (
    <div className="crm-page">
      <PageHeader
        title="Deals"
        description={`${meta.total} opportunities in this view`}
        actions={
          current.permissions.includes('deal.create') ? (
            <DealCreateSheet
              open={createOpen}
              onOpenChange={setCreateOpen}
              onCreated={load}
              trigger={
                <Button>
                  <Plus size={15} />
                  New deal
                </Button>
              }
            />
          ) : undefined
        }
      />
      <SavedViewsBar
        entityType="DEAL"
        filters={{ search, view, pipeline, stage, owner, priority, tag, customFields }}
        sort={{ field: sortField, order: sortOrder }}
        onApply={applySavedView}
      />
      <div className="crm-view-tabs" role="tablist">
        {views.map((item) => (
          <button
            aria-selected={view === item}
            key={item}
            onClick={() => {
              setView(item);
              setPage(1);
            }}
            role="tab"
            type="button"
          >
            {labelize(item)}
          </button>
        ))}
        <span className="deal-view-switch">
          <Button
            onClick={() => setMode('table')}
            variant={mode === 'table' ? 'secondary' : 'ghost'}
          >
            Table
          </Button>
          <Button
            onClick={() => setMode('board')}
            variant={mode === 'board' ? 'secondary' : 'ghost'}
          >
            Board
          </Button>
        </span>
      </div>
      <div className="crm-toolbar crm-toolbar--deals">
        <label className="crm-search">
          <Search size={15} />
          <Input
            aria-label="Search deals"
            placeholder="Search deals..."
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <Select
          value={pipeline || null}
          onValueChange={(value) => {
            setPipeline(value ?? '');
            setStage('');
            setPage(1);
          }}
          options={[
            { label: 'All pipelines', value: '' },
            ...pipelines.map((item) => ({ label: item.name, value: item.id })),
          ]}
          placeholder="Pipeline"
        />
        <Select
          value={stage || null}
          onValueChange={(value) => {
            setStage(value ?? '');
            setPage(1);
          }}
          options={[
            { label: 'All stages', value: '' },
            ...stages.map((item) => ({ label: item.name, value: item.id })),
          ]}
          placeholder="Stage"
        />
        {users.length ? (
          <Select
            value={owner || null}
            onValueChange={(value) => {
              setOwner(value ?? '');
              setPage(1);
            }}
            options={[{ label: 'All owners', value: '' }, ...userOptions(users)]}
            placeholder="Owner"
          />
        ) : null}
        <Select
          value={priority || null}
          onValueChange={(value) => {
            setPriority(value ?? '');
            setPage(1);
          }}
          options={[
            { label: 'All priorities', value: '' },
            ...leadPriorities.map((value) => ({ label: labelize(value), value })),
          ]}
          placeholder="Priority"
        />
        <MetadataListControls
          entityType="DEAL"
          tag={tag}
          onTagChange={(value) => {
            setTag(value);
            setPage(1);
          }}
          customFields={customFields}
          onCustomFieldsChange={(value) => {
            setCustomFields(value);
            setPage(1);
          }}
        />
        <Select
          value={sorting}
          onValueChange={(value) => {
            if (value) setSorting(value);
          }}
          options={[
            { label: 'Newest', value: 'createdAt:desc' },
            { label: 'Value high to low', value: 'amount:desc' },
            { label: 'Close date', value: 'expectedCloseDate:asc' },
            { label: 'Probability high to low', value: 'probability:desc' },
            { label: 'Deal name A-Z', value: 'name:asc' },
          ]}
        />
      </div>
      {!deals && !error ? <LoadingState label="Loading deals" /> : null}
      {error && !deals ? (
        <ErrorState
          description={error}
          action={
            <Button onClick={() => void load()} variant="outline">
              Try again
            </Button>
          }
        />
      ) : null}
      {deals?.length === 0 ? (
        <EmptyState
          icon={<Handshake size={20} />}
          title="No deals in this view"
          description="Create a deal or adjust the current filters."
        />
      ) : null}
      {deals?.length && mode === 'table' ? (
        <div className="crm-table-wrap">
          <table className="crm-table">
            <thead>
              <tr>
                <th>Deal</th>
                <th>Company</th>
                <th>Stage</th>
                <th>Value</th>
                <th>Probability</th>
                <th>Owner</th>
                <th>Expected close</th>
              </tr>
            </thead>
            <tbody>
              {deals.map((deal) => (
                <tr key={deal.id}>
                  <td>
                    <Link className="crm-record-button" href={`/app/deals/${deal.id}`}>
                      <strong>{deal.name}</strong>
                      <span>{labelize(deal.priority)}</span>
                    </Link>
                  </td>
                  <td>{deal.company.name}</td>
                  <td>
                    <StageBadge deal={deal} />
                  </td>
                  <td>{formatMoney(deal.amount, deal.currency)}</td>
                  <td>{deal.probability}%</td>
                  <td>{personName(deal.owner)}</td>
                  <td>
                    {deal.expectedCloseDate
                      ? new Date(deal.expectedCloseDate).toLocaleDateString()
                      : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {deals?.length && mode === 'board' ? (
        <div className="deal-board">
          {stages.map((boardStage) => (
            <section key={boardStage.id}>
              <header>
                <strong>{boardStage.name}</strong>
                <Badge tone="neutral">
                  {deals.filter(({ stageId }) => stageId === boardStage.id).length}
                </Badge>
              </header>
              {deals
                .filter(({ stageId }) => stageId === boardStage.id)
                .map((deal) => (
                  <Link href={`/app/deals/${deal.id}`} key={deal.id}>
                    <strong>{deal.name}</strong>
                    <span>{deal.company.name}</span>
                    <span>{formatMoney(deal.amount, deal.currency)}</span>
                  </Link>
                ))}
            </section>
          ))}
        </div>
      ) : null}
      {deals?.length ? (
        <Pagination currentPage={meta.page} totalPages={meta.totalPages} onPageChange={setPage} />
      ) : null}
    </div>
  );
}

function StageBadge({ deal }: { deal: DealRecord }) {
  return (
    <Badge tone={deal.stage.isWon ? 'success' : deal.stage.isLost ? 'danger' : 'primary'}>
      {deal.stage.name}
    </Badge>
  );
}

export function DealCreateSheet({
  open,
  onOpenChange,
  onCreated,
  trigger,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void | Promise<void>;
  trigger: ReactElement;
}) {
  const formId = useId();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pipelineId, setPipelineId] = useState('');
  const [stageId, setStageId] = useState('');
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const { companies, contacts, users } = useCrmReferenceData({
    companies: true,
    contacts: true,
    users: true,
  });
  const configuration = useRecordConfiguration('DEAL', open);
  useEffect(() => {
    if (open)
      void apiRequest<{ data: Pipeline[] }>('/pipelines?entityType=DEAL')
        .then((result) => {
          setPipelines(result.data);
          const selected = result.data.find(({ isDefault }) => isDefault) ?? result.data[0];
          setPipelineId(selected?.id ?? '');
          setStageId(selected?.stages[0]?.id ?? '');
        })
        .catch(() => setError('Could not load deal pipelines.'));
  }, [open]);
  const stages = useMemo(
    () => pipelines.find(({ id }) => id === pipelineId)?.stages ?? [],
    [pipelineId, pipelines],
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = configurableRecordPayload(event.currentTarget, configuration.definitions);
      await apiRequest('/deals', { method: 'POST', body: JSON.stringify(payload) });
      emitCrmDataChanged(['deals', 'companies']);
      onOpenChange(false);
      await onCreated?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Deal creation failed.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="New deal"
      description="Track a qualified revenue opportunity."
      trigger={trigger}
      footer={
        <>
          <Button disabled={saving} onClick={() => onOpenChange(false)} variant="secondary">
            Cancel
          </Button>
          <Button form={formId} loading={saving} type="submit">
            Create deal
          </Button>
        </>
      }
    >
      {error || configuration.error ? (
        <p className="form-error">{error || configuration.error}</p>
      ) : null}
      <form className="dialog-form" id={formId} onSubmit={(event) => void submit(event)}>
        <label>
          <span>Deal name</span>
          <Input name="name" required />
        </label>
        <Select
          label="Company"
          name="companyId"
          options={companies.map(({ id, name }) => ({ label: name, value: id }))}
          placeholder="Select company"
        />
        <Select
          label="Contact"
          name="contactId"
          options={[
            { label: 'No contact', value: '' },
            ...contacts.map((contact) => ({
              label: `${contact.firstName} ${contact.lastName}`,
              value: contact.id,
            })),
          ]}
          placeholder="Optional contact"
        />
        <Select
          label="Owner"
          name="ownerId"
          options={[{ label: 'Unassigned', value: '' }, ...userOptions(users)]}
          placeholder="Owner"
        />
        <div className="form-two-columns">
          <Select
            label="Pipeline"
            name="pipelineId"
            value={pipelineId || null}
            onValueChange={(value) => {
              const nextPipelineId = value ?? '';
              setPipelineId(nextPipelineId);
              setStageId(pipelines.find(({ id }) => id === nextPipelineId)?.stages[0]?.id ?? '');
            }}
            options={pipelines.map(({ id, name }) => ({ label: name, value: id }))}
          />
          <Select
            label="Stage"
            name="stageId"
            options={stages.map(({ id, name }) => ({ label: name, value: id }))}
            value={stageId || null}
            onValueChange={(value) => setStageId(value ?? '')}
          />
        </div>
        <div className="form-two-columns">
          <label>
            <span>Amount</span>
            <Input min="0" name="amount" step="0.01" type="number" />
          </label>
          <label>
            <span>Currency</span>
            <Input defaultValue="BDT" maxLength={3} name="currency" />
          </label>
        </div>
        <div className="form-two-columns">
          <label>
            <span>Probability</span>
            <Input defaultValue="0" max="100" min="0" name="probability" type="number" />
          </label>
          <label>
            <span>Expected close</span>
            <Input name="expectedCloseDate" type="date" />
          </label>
        </div>
        <Select
          label="Priority"
          name="priority"
          defaultValue="MEDIUM"
          options={leadPriorities.map((value) => ({ label: labelize(value), value }))}
        />
        <label>
          <span>Description</span>
          <Textarea name="description" />
        </label>
        <AdditionalInformationFields
          definitions={configuration.definitions}
          tags={configuration.tags}
        />
      </form>
    </Sheet>
  );
}
