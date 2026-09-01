'use client';
import { AuthMessage } from '@/components/auth-screen';
import { useCurrentUser } from '@/components/auth-provider';
import { apiRequest } from '@/lib/api';
import {
  formatMoney,
  labelize,
  leadPriorities,
  leadSources,
  personName,
  type CompanyRecord,
  type ContactRecord,
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
  Textarea,
} from '@unicrm/ui';
import { ArrowRight, Plus, Search, Target } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

const CREATE_LEAD_FORM_ID = 'create-lead-form';

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
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [users, setUsers] = useState<PersonRef[]>([]);
  const [view, setView] = useState('all');
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('');
  const [owner, setOwner] = useState('');
  const [source, setSource] = useState('');
  const [sort, setSort] = useState('createdAt');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [selected, setSelected] = useState<LeadRecord>();
  const [saving, setSaving] = useState(false);
  const canCreate = current.permissions.includes('lead.create');
  const load = useCallback(async () => {
    try {
      setError('');
      const p = new URLSearchParams({
        page: String(page),
        limit: '25',
        view,
        sort,
        order: sort === 'title' ? 'asc' : 'desc',
      });
      if (search.trim()) p.set('search', search.trim());
      if (stage) p.set('stage', stage);
      if (owner) p.set('owner', owner);
      if (source) p.set('source', source);
      const result = await apiRequest<{ data: LeadRecord[]; meta: PaginationMeta }>(`/leads?${p}`);
      setLeads(result.data);
      setMeta(result.meta);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load leads.');
    }
  }, [owner, page, search, sort, source, stage, view]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 250);
    return () => clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    void Promise.all([
      apiRequest<{ data: Pipeline[] }>('/pipelines'),
      apiRequest<{ data: CompanyRecord[] }>('/companies?limit=100&sort=name&order=asc'),
      apiRequest<{ data: ContactRecord[] }>('/contacts?limit=100&sort=lastName&order=asc'),
    ])
      .then(([p, c, k]) => {
        setPipelines(p.data);
        setCompanies(c.data);
        setContacts(k.data);
      })
      .catch(() => undefined);
    if (current.permissions.includes('user.read'))
      void apiRequest<{ data: PersonRef[] }>('/users')
        .then((r) => setUsers(r.data.filter((user) => user.status === 'ACTIVE')))
        .catch(() => undefined);
  }, [current.permissions]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries([...form.entries()].filter(([, v]) => v !== ''));
    try {
      await apiRequest('/leads', { method: 'POST', body: JSON.stringify(payload) });
      setCreateOpen(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Lead creation failed.');
    } finally {
      setSaving(false);
    }
  }
  const stages = pipelines.find((p) => p.isDefault)?.stages ?? pipelines[0]?.stages ?? [];
  return (
    <div className="crm-page">
      <PageHeader
        title="Leads"
        description={`${meta.total} records in this view`}
        actions={
          canCreate ? (
            <Sheet
              open={createOpen}
              onOpenChange={setCreateOpen}
              title="New lead"
              description="Capture the opportunity now; enrich it as the relationship develops."
              footer={
                <>
                  <Button
                    disabled={saving}
                    onClick={() => setCreateOpen(false)}
                    type="button"
                    variant="secondary"
                  >
                    Cancel
                  </Button>
                  <Button form={CREATE_LEAD_FORM_ID} loading={saving} type="submit">
                    Create lead
                  </Button>
                </>
              }
              trigger={
                <Button>
                  <Plus size={15} />
                  New lead
                </Button>
              }
            >
              <LeadForm
                companies={companies}
                contacts={contacts}
                users={users}
                onSubmit={(event) => void create(event)}
              />
            </Sheet>
          ) : undefined
        }
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
          value={sort}
          onValueChange={(v) => v && setSort(v)}
          options={[
            { label: 'Newest', value: 'createdAt' },
            { label: 'Recently active', value: 'lastActivityAt' },
            { label: 'Follow-up', value: 'nextFollowUpAt' },
            { label: 'Value', value: 'estimatedValue' },
            { label: 'Lead name', value: 'title' },
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
function LeadForm({
  companies,
  contacts,
  users,
  onSubmit,
}: {
  companies: CompanyRecord[];
  contacts: ContactRecord[];
  users: PersonRef[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="dialog-form" id={CREATE_LEAD_FORM_ID} onSubmit={onSubmit}>
      <label>
        <span>Lead title</span>
        <Input name="title" required placeholder="Website redesign for ABC" />
      </label>
      <div className="form-two-columns">
        <label>
          <span>First name</span>
          <Input name="firstName" />
        </label>
        <label>
          <span>Last name</span>
          <Input name="lastName" />
        </label>
      </div>
      <Select
        label="Company"
        name="companyId"
        options={companies.map((c) => ({ label: c.name, value: c.id }))}
        placeholder="No company"
      />
      <Select
        label="Contact"
        name="contactId"
        options={contacts.map((c) => ({ label: `${c.firstName} ${c.lastName}`, value: c.id }))}
        placeholder="No contact"
      />
      <div className="form-two-columns">
        <label>
          <span>Email</span>
          <Input name="email" type="email" />
        </label>
        <label>
          <span>Phone</span>
          <Input name="phone" />
        </label>
      </div>
      <div className="form-two-columns">
        <Select
          label="Source"
          name="source"
          options={leadSources.map((s) => ({ label: labelize(s), value: s }))}
          placeholder="Choose source"
        />
        <Select
          label="Priority"
          name="priority"
          defaultValue="MEDIUM"
          options={leadPriorities.map((p) => ({ label: labelize(p), value: p }))}
        />
      </div>
      <div className="form-two-columns">
        <label>
          <span>Estimated value</span>
          <Input name="estimatedValue" type="number" min="0" step="0.01" />
        </label>
        <label>
          <span>Currency</span>
          <Input name="currency" defaultValue="BDT" maxLength={3} />
        </label>
      </div>
      {users.length ? (
        <Select
          label="Owner"
          name="ownerId"
          options={users.map((u) => ({ label: personName(u), value: u.id }))}
          placeholder="Unassigned"
        />
      ) : null}
      <label>
        <span>Next follow-up</span>
        <Input name="nextFollowUpAt" type="datetime-local" />
      </label>
      <label>
        <span>Notes</span>
        <Textarea name="notes" />
      </label>
    </form>
  );
}
