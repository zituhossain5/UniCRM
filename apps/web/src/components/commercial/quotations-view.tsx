'use client';

import { useCurrentUser } from '@/components/auth-provider';
import { apiRequest } from '@/lib/api';
import {
  formatMoney,
  type CommercialReferences,
  type QuotationListResponse,
} from '@/lib/commercial-types';
import { labelize } from '@/lib/crm-types';
import { formatDateOnly } from '@/lib/work-types';
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
} from '@unicrm/ui';
import { FileText, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

const statuses = ['', 'DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED'] as const;

export function QuotationsView() {
  const user = useCurrentUser();
  const [result, setResult] = useState<QuotationListResponse>();
  const [references, setReferences] = useState<CommercialReferences>();
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [company, setCompany] = useState('');
  const [page, setPage] = useState(1);
  const load = useCallback(async () => {
    try {
      setError('');
      const params = new URLSearchParams({
        page: String(page),
        limit: '25',
        sort: 'createdAt',
        order: 'desc',
      });
      if (query.trim()) params.set('search', query.trim());
      if (status) params.set('status', status);
      if (company) params.set('company', company);
      const [list, refs] = await Promise.all([
        apiRequest<QuotationListResponse>(`/quotations?${params}`),
        apiRequest<{ data: CommercialReferences }>('/quotations/reference-data'),
      ]);
      setResult(list);
      setReferences(refs.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load quotations.');
    }
  }, [company, page, query, status]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 200);
    return () => window.clearTimeout(timer);
  }, [load]);

  return (
    <div className="crm-page">
      <PageHeader
        title="Quotations"
        description="Client proposals, acceptance, and commercial value."
        actions={
          user.permissions.includes('quotation.create') ? (
            <Link className="ui-button ui-button--primary" href="/app/quotations/new">
              <Plus size={15} /> New quotation
            </Link>
          ) : undefined
        }
      />
      <div className="crm-view-tabs" role="tablist">
        {statuses.map((value) => (
          <button
            aria-selected={status === value}
            key={value || 'ALL'}
            onClick={() => {
              setStatus(value);
              setPage(1);
            }}
            role="tab"
            type="button"
          >
            {value ? labelize(value) : 'All'}
          </button>
        ))}
      </div>
      <div className="crm-toolbar">
        <label className="crm-search">
          <Search size={16} />
          <Input
            aria-label="Search quotations"
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Search quotation or client..."
            value={query}
          />
        </label>
        <Select
          label="Client"
          onValueChange={(value) => {
            setCompany(value ?? '');
            setPage(1);
          }}
          options={[
            { label: 'All clients', value: '' },
            ...(references?.companies ?? []).map((item) => ({ label: item.name, value: item.id })),
          ]}
          value={company}
        />
      </div>
      {!result && !error ? <LoadingState label="Loading quotations" /> : null}
      {error ? (
        <ErrorState
          description={error}
          action={
            <Button variant="outline" onClick={() => void load()}>
              Try again
            </Button>
          }
        />
      ) : null}
      {result && !result.data.length ? (
        <EmptyState
          icon={<FileText size={20} />}
          title="No quotations yet"
          description="Create a quotation when a client is ready for a proposal."
          action={
            user.permissions.includes('quotation.create') ? (
              <Link className="ui-button ui-button--primary" href="/app/quotations/new">
                Create quotation
              </Link>
            ) : undefined
          }
        />
      ) : null}
      {result?.data.length ? (
        <>
          <div className="crm-table-wrap">
            <table className="crm-table commercial-table">
              <thead>
                <tr>
                  <th>Quotation</th>
                  <th>Client</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th>Issue date</th>
                  <th>Expiry</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((quotation) => (
                  <tr key={quotation.id}>
                    <td>
                      <Link className="crm-record-link" href={`/app/quotations/${quotation.id}`}>
                        <strong>{quotation.quotationNumber}</strong>
                        <span>{quotation._count?.items ?? 0} items</span>
                      </Link>
                    </td>
                    <td>{quotation.company.name}</td>
                    <td>
                      <Badge
                        tone={
                          quotation.status === 'ACCEPTED'
                            ? 'success'
                            : quotation.status === 'REJECTED' || quotation.status === 'EXPIRED'
                              ? 'danger'
                              : quotation.status === 'SENT'
                                ? 'primary'
                                : 'neutral'
                        }
                      >
                        {labelize(quotation.status)}
                      </Badge>
                    </td>
                    <td>{formatMoney(quotation.total, quotation.currency)}</td>
                    <td>{formatDateOnly(quotation.issueDate)}</td>
                    <td>{formatDateOnly(quotation.expiryDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            currentPage={result.meta.page}
            onPageChange={setPage}
            totalPages={result.meta.totalPages}
          />
        </>
      ) : null}
    </div>
  );
}
