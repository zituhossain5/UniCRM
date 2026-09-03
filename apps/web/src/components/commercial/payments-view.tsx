'use client';

import { AuthMessage } from '@/components/auth-screen';
import { useCurrentUser } from '@/components/auth-provider';
import { apiRequest } from '@/lib/api';
import {
  formatMoney,
  type CommercialReferences,
  type PaymentListResponse,
} from '@/lib/commercial-types';
import { labelize } from '@/lib/crm-types';
import { formatDateOnly } from '@/lib/work-types';
import {
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
import { CircleDollarSign, Plus, Search } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from 'react';

export function PaymentsView({
  initialCompanyId = '',
  initialProjectId = '',
  initialQuotationId = '',
  initialOpen = false,
}: {
  initialCompanyId?: string;
  initialProjectId?: string;
  initialQuotationId?: string;
  initialOpen?: boolean;
}) {
  const user = useCurrentUser();
  const formId = useId();
  const [result, setResult] = useState<PaymentListResponse>();
  const [refs, setRefs] = useState<CommercialReferences>();
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [company, setCompany] = useState('');
  const [method, setMethod] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [paymentCompany, setPaymentCompany] = useState(initialCompanyId);
  const [paymentProject, setPaymentProject] = useState(initialProjectId);
  const [paymentQuotation, setPaymentQuotation] = useState(initialQuotationId);
  const load = useCallback(async () => {
    try {
      setError('');
      const params = new URLSearchParams({
        page: String(page),
        limit: '25',
        sort: 'paymentDate',
        order: 'desc',
      });
      if (query.trim()) params.set('search', query.trim());
      if (company) params.set('company', company);
      if (method) params.set('method', method);
      const [list, referenceResult] = await Promise.all([
        apiRequest<PaymentListResponse>(`/payments?${params}`),
        apiRequest<{ data: CommercialReferences }>('/payments/reference-data'),
      ]);
      setResult(list);
      setRefs(referenceResult.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load payments.');
    }
  }, [company, method, page, query]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 200);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    if (initialOpen || initialCompanyId || initialProjectId || initialQuotationId) setOpen(true);
  }, [initialCompanyId, initialOpen, initialProjectId, initialQuotationId]);
  const projects = useMemo(
    () => (refs?.projects ?? []).filter((item) => item.companyId === paymentCompany),
    [paymentCompany, refs],
  );
  const quotations = useMemo(
    () =>
      (refs?.quotations ?? []).filter(
        (item) =>
          item.companyId === paymentCompany &&
          (!paymentProject || !item.projectId || item.projectId === paymentProject),
      ),
    [paymentCompany, paymentProject, refs],
  );
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    const data = new FormData(event.currentTarget);
    const field = (name: string) => {
      const value = data.get(name);
      return typeof value === 'string' ? value : '';
    };
    const optional = (name: string) => field(name) || null;
    try {
      await apiRequest('/payments', {
        method: 'POST',
        body: JSON.stringify({
          companyId: paymentCompany,
          projectId: paymentProject || null,
          quotationId: paymentQuotation || null,
          amount: field('amount'),
          currency: field('currency').toUpperCase(),
          paymentDate: field('paymentDate'),
          method: optional('method'),
          reference: optional('reference'),
          notes: optional('notes'),
        }),
      });
      setOpen(false);
      await load();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Could not record payment.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="crm-page">
      <PageHeader
        title="Payments"
        description="Recorded client receipts and project balances."
        actions={
          user.permissions.includes('payment.create') ? (
            <Button onClick={() => setOpen(true)}>
              <Plus size={15} /> Record payment
            </Button>
          ) : undefined
        }
      />
      <div className="crm-toolbar">
        <label className="crm-search">
          <Search size={16} />
          <Input
            aria-label="Search payments"
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Search reference or client..."
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
            ...(refs?.companies ?? []).map((item) => ({ label: item.name, value: item.id })),
          ]}
          value={company}
        />
        <Select
          label="Method"
          onValueChange={(value) => {
            setMethod(value ?? '');
            setPage(1);
          }}
          options={[
            { label: 'All methods', value: '' },
            ...['BANK_TRANSFER', 'CASH', 'CARD', 'MOBILE_BANKING', 'CHEQUE', 'OTHER'].map(
              (value) => ({ label: labelize(value), value }),
            ),
          ]}
          value={method}
        />
      </div>
      {!result && !error ? <LoadingState label="Loading payments" /> : null}
      {error ? (
        <ErrorState
          description={error}
          action={
            <Button onClick={() => void load()} variant="outline">
              Try again
            </Button>
          }
        />
      ) : null}
      {result && !result.data.length ? (
        <EmptyState
          icon={<CircleDollarSign size={20} />}
          title="No payments recorded"
          description="Record a client payment when funds are received."
          action={
            user.permissions.includes('payment.create') ? (
              <Button onClick={() => setOpen(true)}>Record payment</Button>
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
                  <th>Date</th>
                  <th>Client</th>
                  <th>Project</th>
                  <th>Quotation</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Reference</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((payment) => (
                  <tr key={payment.id}>
                    <td>{formatDateOnly(payment.paymentDate)}</td>
                    <td>{payment.company.name}</td>
                    <td>{payment.project?.name ?? '-'}</td>
                    <td>{payment.quotation?.quotationNumber ?? '-'}</td>
                    <td>{formatMoney(payment.amount, payment.currency)}</td>
                    <td>{payment.method ? labelize(payment.method) : '-'}</td>
                    <td>{payment.reference ?? '-'}</td>
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
      <Sheet
        title="Record payment"
        description="Add a received client payment."
        open={open}
        onOpenChange={setOpen}
        trigger={
          <button className="visually-hidden" type="button">
            Record payment
          </button>
        }
        footer={
          <>
            <Button onClick={() => setOpen(false)} variant="secondary">
              Cancel
            </Button>
            <Button form={formId} loading={saving} type="submit">
              Record payment
            </Button>
          </>
        }
      >
        {formError ? <AuthMessage>{formError}</AuthMessage> : null}
        <form className="dialog-form" id={formId} onSubmit={(event) => void create(event)}>
          <Select
            label="Client"
            onValueChange={(value) => {
              setPaymentCompany(value ?? '');
              setPaymentProject('');
              setPaymentQuotation('');
            }}
            options={(refs?.companies ?? []).map((item) => ({ label: item.name, value: item.id }))}
            placeholder="Choose a company"
            value={paymentCompany}
          />
          <Select
            label="Project"
            onValueChange={(value) => {
              setPaymentProject(value ?? '');
              setPaymentQuotation('');
            }}
            options={projects.map((item) => ({ label: item.name, value: item.id }))}
            placeholder="Optional"
            value={paymentProject}
          />
          <Select
            label="Quotation"
            onValueChange={(value) => setPaymentQuotation(value ?? '')}
            options={quotations.map((item) => ({
              label: `${item.quotationNumber} - ${formatMoney(item.total, item.currency)}`,
              value: item.id,
            }))}
            placeholder="Optional"
            value={paymentQuotation}
          />
          <div className="form-two-columns">
            <label>
              <span>Amount</span>
              <Input min="0.01" name="amount" required step="0.01" type="number" />
            </label>
            <label>
              <span>Currency</span>
              <Input
                defaultValue={
                  projects.find((item) => item.id === paymentProject)?.currency ??
                  quotations.find((item) => item.id === paymentQuotation)?.currency ??
                  'BDT'
                }
                maxLength={3}
                name="currency"
                required
              />
            </label>
          </div>
          <div className="form-two-columns">
            <label>
              <span>Payment date</span>
              <Input
                defaultValue={new Date().toISOString().slice(0, 10)}
                name="paymentDate"
                required
                type="date"
              />
            </label>
            <Select
              label="Method"
              name="method"
              options={['BANK_TRANSFER', 'CASH', 'CARD', 'MOBILE_BANKING', 'CHEQUE', 'OTHER'].map(
                (value) => ({ label: labelize(value), value }),
              )}
              placeholder="Optional"
            />
          </div>
          <label>
            <span>Reference</span>
            <Input maxLength={200} name="reference" />
          </label>
          <label>
            <span>Notes</span>
            <Textarea maxLength={10000} name="notes" />
          </label>
        </form>
      </Sheet>
    </div>
  );
}
