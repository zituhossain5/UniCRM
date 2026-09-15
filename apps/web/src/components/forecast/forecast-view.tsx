'use client';

import { useCurrentUser } from '@/components/auth-provider';
import { apiRequest } from '@/lib/api';
import type { PersonRef } from '@/lib/crm-types';
import { personName } from '@/lib/crm-types';
import type { ForecastPipeline, ForecastResponse } from '@/lib/forecast-types';
import {
  Button,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  PageHeader,
  Pagination,
  Select,
} from '@unicrm/ui';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Search } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

const money = (amount: string | null, currency: string) =>
  amount === null
    ? '—'
    : new Intl.NumberFormat('en-BD', {
        currency,
        maximumFractionDigits: 2,
        style: 'currency',
      }).format(Number(amount));

const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(
        new Date(value),
      )
    : '—';

export function ForecastView() {
  const current = useCurrentUser();
  const canReadAll = current.permissions.includes('forecast.read_all');
  const [period, setPeriod] = useState('month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [owner, setOwner] = useState('');
  const [pipeline, setPipeline] = useState('');
  const [stage, setStage] = useState('');
  const [state, setState] = useState('all');
  const [sort, setSort] = useState('expectedCloseDate');
  const [order, setOrder] = useState('asc');
  const [groupBy, setGroupBy] = useState('month');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const options = useQuery({
    queryKey: ['forecast-options'],
    queryFn: async () => {
      const [pipelines, users] = await Promise.all([
        apiRequest<{ data: ForecastPipeline[] }>('/pipelines?entityType=DEAL'),
        canReadAll
          ? apiRequest<{ data: PersonRef[] }>('/users')
          : Promise.resolve({ data: [] as PersonRef[] }),
      ]);
      return { pipelines: pipelines.data, users: users.data };
    },
  });
  const params = new URLSearchParams({
    period,
    state,
    sort,
    order,
    groupBy,
    page: String(page),
    limit: '25',
  });
  if (period === 'custom' && from && to) {
    params.set('from', from);
    params.set('to', to);
  }
  if (owner) params.set('owner', owner);
  if (pipeline) params.set('pipeline', pipeline);
  if (stage) params.set('stage', stage);
  if (search.trim()) params.set('search', search.trim());
  const forecast = useQuery({
    queryKey: ['forecast', params.toString()],
    queryFn: () => apiRequest<ForecastResponse>(`/forecast?${params}`),
    enabled: period !== 'custom' || Boolean(from && to),
    staleTime: 30_000,
  });
  const pipelines = options.data?.pipelines ?? [];
  const stages = useMemo(
    () =>
      pipelines.find(({ id }) => id === pipeline)?.stages ??
      pipelines.flatMap((item) => item.stages),
    [pipeline, pipelines],
  );
  const data = forecast.data?.data;
  const meta = forecast.data?.meta;
  const summary = data?.summary;
  const summaryMoney = (key: keyof ForecastResponse['data']['summary']['currencies'][number]) =>
    summary?.currencies
      .map((item) => (typeof item[key] === 'string' ? money(item[key], item.currency) : null))
      .filter(Boolean)
      .join(' · ') || '—';

  return (
    <section className="crm-page forecast-page">
      <PageHeader
        title="Sales Forecast"
        description={`Backend-authoritative pipeline forecast${meta ? ` · ${meta.timezone} · ${meta.visibility === 'own' ? 'My deals' : 'Organization'}` : ''}`}
      />
      <div className="forecast-filters">
        <label className="crm-search">
          <Search aria-hidden="true" size={16} />
          <Input
            aria-label="Search forecast deals"
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search deals or companies…"
            value={search}
          />
        </label>
        <ForecastSelect
          label="Period"
          value={period}
          onChange={(value) => {
            setPeriod(value);
            setPage(1);
          }}
          options={[
            ['month', 'This month'],
            ['quarter', 'This quarter'],
            ['custom', 'Custom range'],
          ]}
        />
        {canReadAll ? (
          <ForecastSelect
            label="Owner"
            value={owner}
            onChange={(value) => {
              setOwner(value);
              setPage(1);
            }}
            options={[
              ['', 'All owners'],
              ...(options.data?.users ?? []).map(
                (user) => [user.id, personName(user)] as [string, string],
              ),
            ]}
          />
        ) : null}
        <ForecastSelect
          label="Pipeline"
          value={pipeline}
          onChange={(value) => {
            setPipeline(value);
            setStage('');
            setPage(1);
          }}
          options={[
            ['', 'All pipelines'],
            ...pipelines.map((item) => [item.id, item.name] as [string, string]),
          ]}
        />
        <ForecastSelect
          label="Stage"
          value={stage}
          onChange={(value) => {
            setStage(value);
            setPage(1);
          }}
          options={[
            ['', 'All stages'],
            ...stages.map((item) => [item.id, item.name] as [string, string]),
          ]}
        />
        <ForecastSelect
          label="State"
          value={state}
          onChange={(value) => {
            setState(value);
            setPage(1);
          }}
          options={[
            ['all', 'All outcomes'],
            ['open', 'Open'],
            ['won', 'Won'],
            ['lost', 'Lost'],
          ]}
        />
        <ForecastSelect
          label="Sort"
          value={sort}
          onChange={(value) => {
            setSort(value);
            setPage(1);
          }}
          options={[
            ['expectedCloseDate', 'Expected close'],
            ['amount', 'Amount'],
            ['weightedValue', 'Weighted value'],
            ['probability', 'Probability'],
            ['daysInStage', 'Days in stage'],
            ['name', 'Deal name'],
          ]}
        />
        <ForecastSelect
          label="Forecast grouping"
          value={groupBy}
          onChange={setGroupBy}
          options={[
            ['week', 'Group by week'],
            ['month', 'Group by month'],
            ['quarter', 'Group by quarter'],
          ]}
        />
        <ForecastSelect
          label="Sort direction"
          value={order}
          onChange={(value) => {
            setOrder(value);
            setPage(1);
          }}
          options={[
            ['asc', 'Ascending'],
            ['desc', 'Descending'],
          ]}
        />
        {period === 'custom' ? (
          <>
            <label className="forecast-date">
              <span>From</span>
              <Input
                type="date"
                value={from}
                onChange={(event) => {
                  setFrom(event.target.value);
                  setPage(1);
                }}
              />
            </label>
            <label className="forecast-date">
              <span>To</span>
              <Input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(event) => {
                  setTo(event.target.value);
                  setPage(1);
                }}
              />
            </label>
          </>
        ) : null}
      </div>
      {forecast.isLoading ? (
        <LoadingState label="Loading sales forecast" />
      ) : forecast.isError ? (
        <ErrorState
          description={forecast.error.message}
          action={
            <Button variant="outline" onClick={() => void forecast.refetch()}>
              Try again
            </Button>
          }
        />
      ) : !data || !summary ? null : (
        <>
          <div className="forecast-metrics">
            <ForecastMetric label="Open pipeline" value={summaryMoney('openPipeline')} />
            <ForecastMetric label="Weighted pipeline" value={summaryMoney('weightedPipeline')} />
            <ForecastMetric label="Expected this month" value={summaryMoney('expectedThisMonth')} />
            <ForecastMetric label="Won this month" value={summaryMoney('wonThisMonth')} />
            <ForecastMetric
              label="Win rate"
              value={summary.winRate === null ? '—' : `${summary.winRate}%`}
              hint={`${summary.won} won · ${summary.lost} lost`}
            />
          </div>
          <div className="forecast-metrics forecast-metrics--secondary">
            <ForecastMetric
              label="Expected this quarter"
              value={summaryMoney('expectedThisQuarter')}
            />
            <ForecastMetric label="Lost this month" value={summaryMoney('lostThisMonth')} />
            <ForecastMetric label="Average deal size" value={summaryMoney('averageDealSize')} />
            <ForecastMetric
              label="Average sales cycle"
              value={
                summary.averageSalesCycleDays === null
                  ? '—'
                  : `${summary.averageSalesCycleDays} days`
              }
            />
          </div>
          <div className="forecast-grid">
            <ForecastStageTable rows={data.byStage} />
            <ForecastTimelineTable rows={data.timeline} groupBy={groupBy} />
          </div>
          <ForecastOwnerTable rows={data.byOwner} />
          <section className="forecast-section">
            <header>
              <div>
                <h2>Deal drill-down</h2>
                <p>Exact values and current-stage aging for the selected close-date range.</p>
              </div>
            </header>
            {data.deals.length ? (
              <DealTable rows={data.deals} />
            ) : (
              <EmptyState
                icon={<BarChart3 size={22} />}
                title="No forecast deals"
                description="No deals match the selected forecast filters."
              />
            )}
            {meta ? (
              <Pagination
                currentPage={meta.page}
                totalPages={meta.totalPages}
                onPageChange={setPage}
              />
            ) : null}
          </section>
        </>
      )}
    </section>
  );
}

function ForecastSelect({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
  value: string;
}) {
  return (
    <div className="forecast-filter">
      <Select
        label={label}
        options={options.map(([optionValue, optionLabel]) => ({
          label: optionLabel,
          value: optionValue,
        }))}
        value={value}
        onValueChange={(next) => onChange(next ?? '')}
      />
    </div>
  );
}
function ForecastMetric({ hint, label, value }: { hint?: string; label: string; value: string }) {
  return (
    <div className="forecast-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}
function ForecastStageTable({ rows }: { rows: ForecastResponse['data']['byStage'] }) {
  const maximum = Math.max(1, ...rows.map((row) => Number(row.totalValue)));
  return (
    <section className="forecast-section">
      <header>
        <div>
          <h2>Pipeline by stage</h2>
          <p>Open deals expected in the selected range.</p>
        </div>
      </header>
      <div className="forecast-table-wrap">
        <table className="forecast-table">
          <thead>
            <tr>
              <th>Stage</th>
              <th>Deals</th>
              <th>Total value</th>
              <th>Weighted value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.id}:${row.currency}`}>
                <td>
                  <strong>{row.name}</strong>
                  <small>{row.pipelineName}</small>
                  <span className="forecast-bar">
                    <span
                      style={{ width: `${Math.max(2, (Number(row.totalValue) / maximum) * 100)}%` }}
                    />
                  </span>
                </td>
                <td>{row.dealCount}</td>
                <td>{money(row.totalValue, row.currency)}</td>
                <td>{money(row.weightedValue, row.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function ForecastTimelineTable({
  groupBy,
  rows,
}: {
  groupBy: string;
  rows: ForecastResponse['data']['timeline'];
}) {
  return (
    <section className="forecast-section">
      <header>
        <div>
          <h2>Weighted forecast</h2>
          <p>Expected close value grouped by {groupBy}.</p>
        </div>
      </header>
      <div className="forecast-table-wrap">
        <table className="forecast-table">
          <thead>
            <tr>
              <th>Period</th>
              <th>Pipeline</th>
              <th>Weighted</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.period}:${row.currency}`}>
                <td>{date(row.period)}</td>
                <td>{money(row.value, row.currency)}</td>
                <td>{money(row.weightedValue, row.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function ForecastOwnerTable({ rows }: { rows: ForecastResponse['data']['byOwner'] }) {
  return (
    <section className="forecast-section">
      <header>
        <div>
          <h2>Forecast by owner</h2>
          <p>Pipeline and closed performance within the active visibility scope.</p>
        </div>
      </header>
      <div className="forecast-table-wrap">
        <table className="forecast-table">
          <thead>
            <tr>
              <th>Owner</th>
              <th>Open deals</th>
              <th>Pipeline value</th>
              <th>Weighted value</th>
              <th>Won value</th>
              <th>Win rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.id ?? 'unassigned'}:${row.currency}`}>
                <td>{row.id ? `${row.firstName} ${row.lastName}` : 'Unassigned'}</td>
                <td>{row.openDeals}</td>
                <td>{money(row.pipelineValue, row.currency)}</td>
                <td>{money(row.weightedValue, row.currency)}</td>
                <td>{money(row.wonValue, row.currency)}</td>
                <td>{row.winRate === null ? '—' : `${row.winRate}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function DealTable({ rows }: { rows: ForecastResponse['data']['deals'] }) {
  return (
    <div className="forecast-table-wrap">
      <table className="forecast-table forecast-deal-table">
        <thead>
          <tr>
            <th>Deal</th>
            <th>Company</th>
            <th>Owner</th>
            <th>Stage</th>
            <th>Amount</th>
            <th>Probability</th>
            <th>Weighted value</th>
            <th>Expected close</th>
            <th>Days in stage</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <Link href={`/app/deals/${row.id}`}>{row.name}</Link>
              </td>
              <td>
                <Link href={`/app/companies/${row.companyId}`}>{row.companyName}</Link>
              </td>
              <td>{row.ownerId ? `${row.ownerFirstName} ${row.ownerLastName}` : 'Unassigned'}</td>
              <td>{row.stageName}</td>
              <td>{money(row.amount, row.currency)}</td>
              <td>{row.probability}%</td>
              <td>{money(row.weightedValue, row.currency)}</td>
              <td>{date(row.expectedCloseDate)}</td>
              <td>{row.daysInStage}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
