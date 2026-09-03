'use client';

import { useCurrentUser } from '@/components/auth-provider';
import { apiBaseUrl, apiRequest } from '@/lib/api';
import { formatMoney, type QuotationRecord } from '@/lib/commercial-types';
import { labelize, personName } from '@/lib/crm-types';
import { formatDateOnly } from '@/lib/work-types';
import { Badge, Button, ErrorState, LoadingState, PageHeader } from '@unicrm/ui';
import { Check, Download, Pencil, Send, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

export function QuotationDetail({ id }: { id: string }) {
  const user = useCurrentUser();
  const [quotation, setQuotation] = useState<QuotationRecord>();
  const [error, setError] = useState('');
  const [working, setWorking] = useState('');
  const load = useCallback(async () => {
    try {
      setError('');
      setQuotation((await apiRequest<{ data: QuotationRecord }>(`/quotations/${id}`)).data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load quotation.');
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);
  async function transition(action: 'send' | 'accept' | 'reject') {
    try {
      setWorking(action);
      await apiRequest(`/quotations/${id}/${action}`, { method: 'POST' });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update quotation.');
    } finally {
      setWorking('');
    }
  }
  async function download() {
    try {
      setWorking('pdf');
      const response = await fetch(`${apiBaseUrl()}/quotations/${id}/pdf`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Could not generate PDF.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `${quotation?.quotationNumber ?? 'quotation'}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not download PDF.');
    } finally {
      setWorking('');
    }
  }
  if (!quotation && !error) return <LoadingState label="Loading quotation" />;
  if (!quotation)
    return (
      <ErrorState
        description={error}
        action={
          <Button onClick={() => void load()} variant="outline">
            Try again
          </Button>
        }
      />
    );
  return (
    <div className="crm-page quotation-detail">
      <PageHeader
        title={quotation.quotationNumber}
        description={quotation.company.name}
        actions={
          <div className="page-action-row">
            {quotation.status === 'DRAFT' && user.permissions.includes('quotation.update') ? (
              <Link className="ui-button ui-button--secondary" href={`/app/quotations/${id}/edit`}>
                <Pencil size={15} /> Edit draft
              </Link>
            ) : null}
            {quotation.status === 'DRAFT' && user.permissions.includes('quotation.send') ? (
              <Button loading={working === 'send'} onClick={() => void transition('send')}>
                <Send size={15} /> Mark sent
              </Button>
            ) : null}
            {quotation.status === 'SENT' && user.permissions.includes('quotation.accept') ? (
              <Button loading={working === 'accept'} onClick={() => void transition('accept')}>
                <Check size={15} /> Accept
              </Button>
            ) : null}
            {quotation.status === 'SENT' && user.permissions.includes('quotation.reject') ? (
              <Button
                loading={working === 'reject'}
                onClick={() => void transition('reject')}
                variant="outline"
              >
                <X size={15} /> Reject
              </Button>
            ) : null}
            <Button loading={working === 'pdf'} onClick={() => void download()} variant="secondary">
              <Download size={15} /> PDF
            </Button>
          </div>
        }
      />
      {error ? <div className="inline-error">{error}</div> : null}
      <div className="quotation-status-line">
        <Badge
          tone={
            quotation.status === 'ACCEPTED'
              ? 'success'
              : quotation.status === 'SENT'
                ? 'primary'
                : quotation.status === 'REJECTED' || quotation.status === 'EXPIRED'
                  ? 'danger'
                  : 'neutral'
          }
        >
          {labelize(quotation.status)}
        </Badge>
        {quotation.pdfSnapshotAt ? (
          <span>Document snapshot created {formatDateOnly(quotation.pdfSnapshotAt)}</span>
        ) : (
          <span>PDF preview generated on demand</span>
        )}
      </div>
      <section className="detail-section">
        <div className="detail-grid">
          <div>
            <span>Client</span>
            <strong>{quotation.company.name}</strong>
          </div>
          <div>
            <span>Contact</span>
            <strong>{personName(quotation.contact)}</strong>
          </div>
          <div>
            <span>Issue date</span>
            <strong>{formatDateOnly(quotation.issueDate)}</strong>
          </div>
          <div>
            <span>Expiry</span>
            <strong>{formatDateOnly(quotation.expiryDate)}</strong>
          </div>
          <div>
            <span>Project</span>
            <strong>{quotation.project?.name ?? '-'}</strong>
          </div>
          <div>
            <span>Lead</span>
            <strong>{quotation.lead?.title ?? '-'}</strong>
          </div>
        </div>
      </section>
      <section className="detail-section">
        <h2>Items</h2>
        <div className="crm-table-wrap">
          <table className="crm-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Quantity</th>
                <th>Rate</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {quotation.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.description}</td>
                  <td>{item.quantity}</td>
                  <td>{formatMoney(item.unitPrice, quotation.currency)}</td>
                  <td>{formatMoney(item.amount, quotation.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="quotation-detail-totals">
          <div>
            <dt>Subtotal</dt>
            <dd>{formatMoney(quotation.subtotal, quotation.currency)}</dd>
          </div>
          <div>
            <dt>Discount</dt>
            <dd>{formatMoney(quotation.discountAmount, quotation.currency)}</dd>
          </div>
          <div>
            <dt>Tax</dt>
            <dd>{formatMoney(quotation.taxAmount, quotation.currency)}</dd>
          </div>
          <div>
            <dt>Total</dt>
            <dd>{formatMoney(quotation.total, quotation.currency)}</dd>
          </div>
          <div>
            <dt>Paid</dt>
            <dd>{formatMoney(quotation.paid, quotation.currency)}</dd>
          </div>
          <div>
            <dt>Remaining</dt>
            <dd>{formatMoney(quotation.remaining, quotation.currency)}</dd>
          </div>
        </dl>
      </section>
      {quotation.notes || quotation.terms ? (
        <section className="detail-section quotation-copy-detail">
          {quotation.notes ? (
            <div>
              <h2>Notes</h2>
              <p>{quotation.notes}</p>
            </div>
          ) : null}
          {quotation.terms ? (
            <div>
              <h2>Terms</h2>
              <p>{quotation.terms}</p>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
