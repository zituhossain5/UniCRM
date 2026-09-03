'use client';

import { ErrorState, Input, LoadingState, PageHeader } from '@unicrm/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { apiRequest } from '@/lib/api';

const reports = [
  ['lead-pipeline', 'Lead pipeline'],
  ['lead-conversion', 'Lead conversion'],
  ['leads-by-source', 'Leads by source'],
  ['projects-by-status', 'Projects by status'],
  ['tasks-by-status', 'Tasks by status'],
  ['overdue-tasks', 'Overdue tasks'],
  ['payments', 'Payments received'],
  ['outstanding-balances', 'Outstanding balances'],
] as const;
type ReportId = (typeof reports)[number][0];
type ReportPayload = {
  data: Array<Record<string, unknown>> | Record<string, unknown>;
  totals?: Array<{ currency: string; amount: string }>;
  meta?: Record<string, unknown>;
};
const text = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number' ? `${value}` : '—';
const label = (value: unknown) =>
  text(value)
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/^./, (character) => character.toUpperCase());
const money = (value: unknown, currency: unknown) =>
  value == null
    ? '—'
    : new Intl.NumberFormat('en-BD', {
        style: 'currency',
        currency: typeof currency === 'string' ? currency : 'BDT',
      }).format(Number(value));

export function ReportsView() {
  const [active, setActive] = useState<ReportId>('lead-pipeline');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const queryString =
    active === 'payments'
      ? `?${new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) })}`
      : '';
  const report = useQuery({
    queryKey: ['report', active, from, to],
    queryFn: () => apiRequest<ReportPayload>(`/reports/${active}${queryString}`),
    staleTime: 60_000,
  });
  return (
    <section className="operational-page reports-page">
      <PageHeader
        title="Reports"
        description="Operational CRM, delivery, and financial reporting from live records."
      />
      <div className="report-tabs" role="tablist">
        {reports.map(([id, name]) => (
          <button
            aria-selected={active === id}
            key={id}
            onClick={() => setActive(id)}
            role="tab"
            type="button"
          >
            {name}
          </button>
        ))}
      </div>
      {active === 'payments' ? (
        <div className="report-filters">
          <label>
            From
            <Input onChange={(event) => setFrom(event.target.value)} type="date" value={from} />
          </label>
          <label>
            To
            <Input onChange={(event) => setTo(event.target.value)} type="date" value={to} />
          </label>
        </div>
      ) : null}
      {report.isLoading ? (
        <LoadingState label="Loading report" />
      ) : report.isError ? (
        <ErrorState
          action={
            <button className="ui-button ui-button--outline" onClick={() => void report.refetch()}>
              Try again
            </button>
          }
          description={report.error.message}
        />
      ) : (
        <ReportResult id={active} payload={report.data!} />
      )}
    </section>
  );
}

function ReportResult({ id, payload }: { id: ReportId; payload: ReportPayload }) {
  if (id === 'lead-conversion') {
    const data = payload.data as Record<string, unknown>;
    return (
      <section className="conversion-panel">
        <strong>
          {data.conversionPercent == null ? 'No closed leads' : `${text(data.conversionPercent)}%`}
        </strong>
        <p>
          {text(data.won)} won · {text(data.lost)} lost
        </p>
        <small>{text(payload.meta?.formula)}</small>
      </section>
    );
  }
  const rows = payload.data as Array<Record<string, unknown>>;
  if (!rows.length) return <p className="report-empty">No records match this report.</p>;
  if (id === 'overdue-tasks')
    return (
      <Table
        columns={['Task', 'Project', 'Assignee', 'Priority', 'Due date', 'Days overdue']}
        rows={rows.map((row) => [
          row.title,
          objectName(row.project),
          personName(row.assignee),
          label(row.priority),
          date(row.dueDate),
          row.daysOverdue,
        ])}
      />
    );
  if (id === 'payments')
    return (
      <>
        <ReportTotals totals={payload.totals} />
        <Table
          columns={['Date', 'Company', 'Project', 'Amount', 'Method', 'Reference']}
          rows={rows.map((row) => [
            date(row.paymentDate),
            objectName(row.company),
            objectName(row.project),
            money(row.amount, row.currency),
            label(row.method),
            row.reference ?? '—',
          ])}
        />
      </>
    );
  if (id === 'outstanding-balances')
    return (
      <Table
        columns={['Company', 'Project', 'Project value', 'Received', 'Outstanding']}
        rows={rows.map((row) => [
          objectName(row.company),
          row.name,
          money(row.projectValue, row.currency),
          money(row.received, row.currency),
          money(row.outstanding, row.currency),
        ])}
      />
    );
  if (id === 'lead-pipeline')
    return (
      <Table
        columns={['Stage', 'Leads', 'Value']}
        rows={rows.map((row) => [row.name, row.count, values(row.values)])}
      />
    );
  if (id === 'leads-by-source')
    return (
      <Table
        columns={['Source', 'Leads', 'Estimated value']}
        rows={rows.map((row) => [
          label(row.source),
          row.count,
          money(row.estimatedValue, row.currency),
        ])}
      />
    );
  if (id === 'projects-by-status')
    return (
      <Table
        columns={['Status', 'Projects', 'Value']}
        rows={rows.map((row) => [label(row.status), row.count, money(row.value, row.currency)])}
      />
    );
  return (
    <Table columns={['Status', 'Tasks']} rows={rows.map((row) => [label(row.status), row.count])} />
  );
}
function Table({ columns, rows }: { columns: string[]; rows: unknown[][] }) {
  return (
    <div className="report-table-wrap">
      <table className="report-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{text(cell)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function ReportTotals({ totals }: { totals?: Array<{ currency: string; amount: string }> }) {
  return (
    <div className="report-totals">
      <span>Total received</span>
      <strong>
        {totals?.map((total) => money(total.amount, total.currency)).join(' · ') || '—'}
      </strong>
    </div>
  );
}
function objectName(value: unknown) {
  return value && typeof value === 'object' && 'name' in value ? String(value.name) : '—';
}
function personName(value: unknown) {
  return value && typeof value === 'object' && 'firstName' in value && 'lastName' in value
    ? `${String(value.firstName)} ${String(value.lastName)}`
    : 'Unassigned';
}
function date(value: unknown) {
  return typeof value === 'string'
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(
        new Date(value),
      )
    : '—';
}
function values(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((entry: { amount: string; currency: string }) => money(entry.amount, entry.currency))
        .join(' · ') || '—'
    : '—';
}
