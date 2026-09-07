'use client';
import { AuthMessage } from '@/components/auth-screen';
import { useCurrentUser } from '@/components/auth-provider';
import { LeadCreateSheet } from '@/components/crm/create-sheets';
import { MetadataListControls, SavedViewsBar } from '@/components/configuration/list-configuration';
import { apiRequest } from '@/lib/api';
import { onCrmDataChanged } from '@/lib/crm-events';
import {
  formatMoney,
  labelize,
  leadSources,
  personName,
  type LeadRecord,
  type PaginationMeta,
  type PersonRef,
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
} from '@unicrm/ui';
import { ArrowRight, Plus, Search, Target } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

const views = [
  { label: 'All', value: 'all' },
  { label: 'My leads', value: 'mine' },
  { label: 'Follow-up due', value: 'followUpDue' },
  { label: 'Won', value: 'won' },
  { label: 'Lost', value: 'lost' },
] as const;
export function LeadsView() {
  const current = useCurrentUser();
  const [leads, setLeads] = useState<LeadRecord[]>();
  const [meta, setMeta] = useState<PaginationMeta>({ page: 1, limit: 25, total: 0, totalPages: 1 });
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [users, setUsers] = useState<PersonRef[]>([]);
  const [view, setView] = useState('all');
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('');
  const [pipeline, setPipeline] = useState('');
  const [tag, setTag] = useState('');
  const [customFields, setCustomFields] = useState<Record<string, unknown>>({});
  const [owner, setOwner] = useState('');
  const [source, setSource] = useState('');
  const [priority, setPriority] = useState('');
  const [sorting, setSorting] = useState('createdAt:desc');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [selected, setSelected] = useState<LeadRecord>();
  const canCreate = current.permissions.includes('lead.create');
  const load = useCallback(async () => {
    try {
      setError('');
      const [sort, order] = sorting.split(':');
      const p = new URLSearchParams({ page: String(page), limit: '25', view });
      p.set('sort', sort!);
      p.set('order', order!);
      if (search.trim()) p.set('search', search.trim());
      if (stage) p.set('stage', stage);
      if (pipeline) p.set('pipeline', pipeline);
      if (tag) p.set('tag', tag);
      if (
        Object.keys(customFields).length &&
        Object.values(customFields).every((value) => value !== '')
      )
        p.set('customFields', JSON.stringify(customFields));
      if (owner) p.set('owner', owner);
      if (source) p.set('source', source);
      if (priority) p.set('priority', priority);
      const result = await apiRequest<{ data: LeadRecord[]; meta: PaginationMeta }>(`/leads?${p}`);
      setLeads(result.data);
      setMeta(result.meta);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load leads.');
    }
  }, [customFields, owner, page, pipeline, priority, search, sorting, source, stage, tag, view]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 250);
    return () => clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    void apiRequest<{ data: Pipeline[] }>('/pipelines')
      .then((result) => {
        setPipelines(result.data);
      })
      .catch(() => undefined);
    if (current.permissions.includes('user.read'))
      void apiRequest<{ data: PersonRef[] }>('/users')
        .then((r) => setUsers(r.data.filter((user) => user.status === 'ACTIVE')))
        .catch(() => undefined);
  }, [current.permissions]);
  useEffect(() => onCrmDataChanged(['leads', 'companies', 'contacts'], () => void load()), [load]);
  const stages = pipeline
    ? (pipelines.find((item) => item.id === pipeline)?.stages ?? [])
    : pipelines.flatMap((item) => item.stages);
  const applySavedView = useCallback(
    (
      filters: Record<string, unknown>,
      savedSort: { field: string; order: 'asc' | 'desc' } | null,
    ) => {
      setSearch(typeof filters.search === 'string' ? filters.search : '');
      setView(typeof filters.view === 'string' ? filters.view : 'all');
      setPipeline(typeof filters.pipeline === 'string' ? filters.pipeline : '');
      setStage(typeof filters.stage === 'string' ? filters.stage : '');
      setOwner(typeof filters.owner === 'string' ? filters.owner : '');
      setSource(typeof filters.source === 'string' ? filters.source : '');
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
  const [sortField, sortOrder] = sorting.split(':') as [string, 'asc' | 'desc'];
  return (
    <div className="crm-page">
      <PageHeader
        title="Leads"
        description={`${meta.total} records in this view`}
        actions={
          canCreate ? (
            <LeadCreateSheet
              open={createOpen}
              onOpenChange={setCreateOpen}
              onCreated={load}
              trigger={
                <Button>
                  <Plus size={15} />
                  New lead
                </Button>
              }
            />
          ) : undefined
        }
      />
      <SavedViewsBar
        entityType="LEAD"
        filters={{ search, view, pipeline, stage, owner, source, priority, tag, customFields }}
        sort={{ field: sortField, order: sortOrder }}
        onApply={applySavedView}
      />
      <div className="crm-view-tabs" role="tablist">
        {views.map((item) => (
          <button
            aria-selected={view === item.value}
            key={item.value}
            onClick={() => {
              setView(item.value);
              setPage(1);
            }}
            role="tab"
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="crm-toolbar crm-toolbar--leads">
        <label className="crm-search">
          <Search size={15} />
          <Input
            aria-label="Search leads"
            placeholder="Search leads..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
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
          onValueChange={(v) => {
            setStage(v ?? '');
            setPage(1);
          }}
          options={[
            { label: 'All stages', value: '' },
            ...stages.map((s) => ({ label: s.name, value: s.id })),
          ]}
          placeholder="Stage"
        />
        {users.length ? (
          <Select
            value={owner || null}
            onValueChange={(v) => {
              setOwner(v ?? '');
              setPage(1);
            }}
            options={[
              { label: 'All owners', value: '' },
              ...users.map((u) => ({ label: personName(u), value: u.id })),
            ]}
            placeholder="Owner"
          />
        ) : null}
        <Select
          value={source || null}
          onValueChange={(v) => {
            setSource(v ?? '');
            setPage(1);
          }}
          options={[
            { label: 'All sources', value: '' },
            ...leadSources.map((s) => ({ label: labelize(s), value: s })),
          ]}
          placeholder="Source"
        />
        <Select
          value={priority || null}
          onValueChange={(v) => {
            setPriority(v ?? '');
            setPage(1);
          }}
          options={[
            { label: 'All priorities', value: '' },
            ...['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((value) => ({
              label: labelize(value),
              value,
            })),
          ]}
          placeholder="Priority"
        />
        <MetadataListControls
          entityType="LEAD"
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
          onValueChange={(v) => {
            if (!v) return;
            setSorting(v);
            setPage(1);
          }}
          options={[
            { label: 'Newest', value: 'createdAt:desc' },
            { label: 'Recently active', value: 'lastActivityAt:desc' },
            { label: 'Follow-up soonest', value: 'nextFollowUpAt:asc' },
            { label: 'Value high to low', value: 'estimatedValue:desc' },
            { label: 'Value low to high', value: 'estimatedValue:asc' },
            { label: 'Lead name A-Z', value: 'title:asc' },
          ]}
        />
      </div>
      {error && !leads ? (
        <ErrorState
          description={error}
          action={
            <Button onClick={() => void load()} variant="outline">
              Try again
            </Button>
          }
        />
      ) : null}
      {!leads && !error ? <LoadingState label="Loading leads" /> : null}
      {error && leads ? <AuthMessage>{error}</AuthMessage> : null}
      {leads?.length === 0 ? (
        <EmptyState
          icon={<Target size={20} />}
          title="No leads in this view"
          description="Create a lead or adjust the current filters."
          action={
            canCreate ? <Button onClick={() => setCreateOpen(true)}>Create lead</Button> : undefined
          }
        />
      ) : null}
      {leads?.length ? (
        <div className="crm-table-wrap">
          <table className="crm-table leads-table">
            <thead>
              <tr>
                <th>Lead</th>
                <th>Company</th>
                <th>Stage</th>
                <th>Value</th>
                <th>Owner</th>
                <th>Next follow-up</th>
                <th>Last activity</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id}>
                  <td>
                    <button
                      className="crm-record-button"
                      onClick={() => {
                        setSelected(lead);
                        setQuickOpen(true);
                      }}
                      type="button"
                    >
                      <strong>{lead.title}</strong>
                      <span>
                        {lead.email || lead.phone || labelize(lead.source ?? 'No source')}
                      </span>
                      {lead.tags?.length ? (
                        <span className="record-tags">
                          {lead.tags.map((item) => (
                            <Badge key={item.id} tone="neutral">
                              {item.name}
                            </Badge>
                          ))}
                        </span>
                      ) : null}
                    </button>
                  </td>
                  <td>{lead.company?.name || '-'}</td>
                  <td>
                    <Badge
                      tone={
                        lead.stage.isWon
                          ? 'success'
                          : lead.stage.isLost
                            ? 'danger'
                            : lead.stage.position <= 2
                              ? 'primary'
                              : 'warning'
                      }
                    >
                      {lead.stage.name}
                    </Badge>
                  </td>
                  <td>{formatMoney(lead.estimatedValue, lead.currency)}</td>
                  <td>{personName(lead.owner)}</td>
                  <td
                    className={
                      lead.nextFollowUpAt && new Date(lead.nextFollowUpAt) < new Date()
                        ? 'overdue-text'
                        : ''
                    }
                  >
                    {lead.nextFollowUpAt ? new Date(lead.nextFollowUpAt).toLocaleString() : '-'}
                  </td>
                  <td>{new Date(lead.lastActivityAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {leads?.length ? (
        <Pagination currentPage={meta.page} totalPages={meta.totalPages} onPageChange={setPage} />
      ) : null}
      <Sheet
        open={quickOpen}
        onOpenChange={setQuickOpen}
        title={selected?.title ?? 'Lead'}
        description={selected?.company?.name ?? 'Lead quick view'}
        trigger={<span hidden />}
      >
        {selected ? (
          <div className="quick-view">
            <div className="quick-stage">
              <Badge
                tone={
                  selected.stage.isWon ? 'success' : selected.stage.isLost ? 'danger' : 'primary'
                }
              >
                {selected.stage.name}
              </Badge>
            </div>
            <dl className="detail-list">
              <div>
                <dt>Estimated value</dt>
                <dd>{formatMoney(selected.estimatedValue, selected.currency)}</dd>
              </div>
              <div>
                <dt>Owner</dt>
                <dd>{personName(selected.owner)}</dd>
              </div>
              <div>
                <dt>Priority</dt>
                <dd>{labelize(selected.priority)}</dd>
              </div>
              <div>
                <dt>Next follow-up</dt>
                <dd>
                  {selected.nextFollowUpAt
                    ? new Date(selected.nextFollowUpAt).toLocaleString()
                    : 'Not scheduled'}
                </dd>
              </div>
              <div>
                <dt>Contact</dt>
                <dd>{selected.email || selected.phone || selected.contact?.email || '-'}</dd>
              </div>
            </dl>
            <Link
              className="ui-button ui-button--primary quick-open"
              href={`/app/leads/${selected.id}`}
            >
              Open full record
              <ArrowRight size={15} />
            </Link>
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}
