'use client';

import { AuthMessage } from '@/components/auth-screen';
import { apiRequest } from '@/lib/api';
import {
  formatMoney,
  type CommercialReferences,
  type QuotationRecord,
} from '@/lib/commercial-types';
import { Button, Input, LoadingState, PageHeader, Select, Textarea } from '@unicrm/ui';
import { Plus, Save, Trash2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

type Item = { description: string; quantity: string; unitPrice: string };
const emptyItem = (): Item => ({ description: '', quantity: '1', unitPrice: '0' });

export function QuotationEditor({ quotationId }: { quotationId?: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const [refs, setRefs] = useState<CommercialReferences>();
  const [quotation, setQuotation] = useState<QuotationRecord>();
  const [companyId, setCompanyId] = useState(search.get('companyId') ?? '');
  const [contactId, setContactId] = useState(search.get('contactId') ?? '');
  const [leadId, setLeadId] = useState(search.get('leadId') ?? '');
  const [projectId, setProjectId] = useState(search.get('projectId') ?? '');
  const [currency, setCurrency] = useState(search.get('currency') ?? 'BDT');
  const [discountType, setDiscountType] = useState('');
  const [discountValue, setDiscountValue] = useState('0');
  const [taxRate, setTaxRate] = useState('0');
  const [items, setItems] = useState<Item[]>([emptyItem()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void Promise.all([
      apiRequest<{ data: CommercialReferences }>('/quotations/reference-data'),
      quotationId
        ? apiRequest<{ data: QuotationRecord }>(`/quotations/${quotationId}`)
        : Promise.resolve(undefined),
    ])
      .then(([referenceResult, quotationResult]) => {
        setRefs(referenceResult.data);
        if (quotationResult) {
          const value = quotationResult.data;
          setQuotation(value);
          setCompanyId(value.companyId);
          setContactId(value.contactId ?? '');
          setLeadId(value.leadId ?? '');
          setProjectId(value.projectId ?? '');
          setCurrency(value.currency);
          setDiscountType(value.discountType ?? '');
          setDiscountValue(value.discountValue ?? '0');
          setTaxRate(value.taxRate ?? '0');
          setItems(
            value.items.map((item) => ({
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
            })),
          );
        }
      })
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : 'Could not load quotation editor.'),
      );
  }, [quotationId]);

  const contacts = useMemo(
    () => (refs?.contacts ?? []).filter((item) => item.companyId === companyId),
    [companyId, refs],
  );
  const leads = useMemo(
    () => (refs?.leads ?? []).filter((item) => item.companyId === companyId),
    [companyId, refs],
  );
  const projects = useMemo(
    () => (refs?.projects ?? []).filter((item) => item.companyId === companyId),
    [companyId, refs],
  );
  const subtotal = items.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
    0,
  );
  const discount =
    discountType === 'PERCENTAGE'
      ? (subtotal * (Number(discountValue) || 0)) / 100
      : discountType === 'FIXED'
        ? Number(discountValue) || 0
        : 0;
  const tax = ((subtotal - discount) * (Number(taxRate) || 0)) / 100;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const data = new FormData(event.currentTarget);
    const field = (name: string) => {
      const value = data.get(name);
      return typeof value === 'string' ? value : '';
    };
    const optional = (value: string) => value || null;
    try {
      const result = await apiRequest<{ data: QuotationRecord }>(
        quotationId ? `/quotations/${quotationId}` : '/quotations',
        {
          method: quotationId ? 'PATCH' : 'POST',
          body: JSON.stringify({
            companyId,
            contactId: optional(contactId),
            leadId: optional(leadId),
            projectId: optional(projectId),
            issueDate: field('issueDate'),
            expiryDate: optional(field('expiryDate')),
            currency,
            discountType: optional(discountType),
            discountValue: discountType ? discountValue : null,
            taxRate: taxRate || null,
            notes: optional(field('notes')),
            terms: optional(field('terms')),
            items,
          }),
        },
      );
      router.push(`/app/quotations/${result.data.id}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save quotation.');
    } finally {
      setSaving(false);
    }
  }

  if (!refs && !error) return <LoadingState label="Loading quotation editor" />;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="crm-page quotation-editor">
      <PageHeader
        title={quotation ? `Edit ${quotation.quotationNumber}` : 'New quotation'}
        description="Amounts shown here are estimates until validated by the server."
      />
      {error ? <AuthMessage>{error}</AuthMessage> : null}
      <form className="quotation-form" onSubmit={(event) => void save(event)}>
        <section className="quotation-metadata">
          <div className="form-two-columns">
            <Select
              label="Client"
              onValueChange={(value) => {
                setCompanyId(value ?? '');
                setContactId('');
                setLeadId('');
                setProjectId('');
              }}
              options={(refs?.companies ?? []).map((item) => ({
                label: item.name,
                value: item.id,
              }))}
              placeholder="Choose a company"
              value={companyId}
            />
            <Select
              label="Contact"
              onValueChange={(value) => setContactId(value ?? '')}
              options={contacts.map((item) => ({
                label: `${item.firstName} ${item.lastName}`,
                value: item.id,
              }))}
              placeholder="Optional"
              value={contactId}
            />
          </div>
          <div className="form-two-columns">
            <Select
              label="Lead"
              onValueChange={(value) => setLeadId(value ?? '')}
              options={leads.map((item) => ({ label: item.title, value: item.id }))}
              placeholder="Optional"
              value={leadId}
            />
            <Select
              label="Project"
              onValueChange={(value) => setProjectId(value ?? '')}
              options={projects.map((item) => ({ label: item.name, value: item.id }))}
              placeholder="Optional"
              value={projectId}
            />
          </div>
          <div className="form-three-columns">
            <label>
              <span>Issue date</span>
              <Input
                defaultValue={quotation?.issueDate.slice(0, 10) ?? today}
                name="issueDate"
                required
                type="date"
              />
            </label>
            <label>
              <span>Expiry date</span>
              <Input
                defaultValue={quotation?.expiryDate?.slice(0, 10) ?? ''}
                name="expiryDate"
                type="date"
              />
            </label>
            <label>
              <span>Currency</span>
              <Input
                maxLength={3}
                onChange={(event) => setCurrency(event.target.value.toUpperCase())}
                required
                value={currency}
              />
            </label>
          </div>
        </section>
        <section className="quotation-items">
          <div className="section-heading">
            <div>
              <h2>Items</h2>
            </div>
            <Button
              onClick={() => setItems((value) => [...value, emptyItem()])}
              type="button"
              variant="secondary"
            >
              <Plus size={15} /> Add item
            </Button>
          </div>
          <div className="quotation-item-head">
            <span>Description</span>
            <span>Quantity</span>
            <span>Unit price</span>
            <span>Amount</span>
            <span />
          </div>
          {items.map((item, index) => (
            <div className="quotation-item-row" key={index}>
              <label>
                <span>Description</span>
                <Input
                  maxLength={500}
                  onChange={(event) =>
                    setItems((value) =>
                      value.map((current, position) =>
                        position === index
                          ? { ...current, description: event.target.value }
                          : current,
                      ),
                    )
                  }
                  required
                  value={item.description}
                />
              </label>
              <label>
                <span>Quantity</span>
                <Input
                  min="0.0001"
                  onChange={(event) =>
                    setItems((value) =>
                      value.map((current, position) =>
                        position === index ? { ...current, quantity: event.target.value } : current,
                      ),
                    )
                  }
                  required
                  step="0.0001"
                  type="number"
                  value={item.quantity}
                />
              </label>
              <label>
                <span>Unit price</span>
                <Input
                  min="0"
                  onChange={(event) =>
                    setItems((value) =>
                      value.map((current, position) =>
                        position === index
                          ? { ...current, unitPrice: event.target.value }
                          : current,
                      ),
                    )
                  }
                  required
                  step="0.01"
                  type="number"
                  value={item.unitPrice}
                />
              </label>
              <strong>
                {formatMoney(
                  (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
                  currency,
                )}
              </strong>
              <Button
                aria-label="Remove item"
                disabled={items.length === 1}
                onClick={() =>
                  setItems((value) => value.filter((_item, position) => position !== index))
                }
                type="button"
                variant="ghost"
              >
                <Trash2 size={16} />
              </Button>
            </div>
          ))}
        </section>
        <section className="quotation-bottom">
          <div className="quotation-copy">
            <label>
              <span>Notes</span>
              <Textarea defaultValue={quotation?.notes ?? ''} maxLength={10000} name="notes" />
            </label>
            <label>
              <span>Terms</span>
              <Textarea defaultValue={quotation?.terms ?? ''} maxLength={10000} name="terms" />
            </label>
          </div>
          <div className="quotation-totals">
            <div className="form-two-columns">
              <Select
                label="Discount"
                onValueChange={(value) => setDiscountType(value ?? '')}
                options={[
                  { label: 'No discount', value: '' },
                  { label: 'Percentage', value: 'PERCENTAGE' },
                  { label: 'Fixed amount', value: 'FIXED' },
                ]}
                value={discountType}
              />
              <label>
                <span>Value</span>
                <Input
                  disabled={!discountType}
                  min="0"
                  onChange={(event) => setDiscountValue(event.target.value)}
                  step="0.0001"
                  type="number"
                  value={discountValue}
                />
              </label>
            </div>
            <label>
              <span>Tax rate (%)</span>
              <Input
                max="100"
                min="0"
                onChange={(event) => setTaxRate(event.target.value)}
                step="0.0001"
                type="number"
                value={taxRate}
              />
            </label>
            <dl>
              <div>
                <dt>Subtotal</dt>
                <dd>{formatMoney(subtotal, currency)}</dd>
              </div>
              <div>
                <dt>Discount</dt>
                <dd>{formatMoney(discount, currency)}</dd>
              </div>
              <div>
                <dt>Tax</dt>
                <dd>{formatMoney(tax, currency)}</dd>
              </div>
              <div className="quotation-grand-total">
                <dt>Total</dt>
                <dd>{formatMoney(subtotal - discount + tax, currency)}</dd>
              </div>
            </dl>
          </div>
        </section>
        <div className="quotation-editor-actions">
          <a
            className="ui-button ui-button--secondary"
            href={quotationId ? `/app/quotations/${quotationId}` : '/app/quotations'}
          >
            Cancel
          </a>
          <Button disabled={!companyId} loading={saving} type="submit">
            <Save size={15} /> Save draft
          </Button>
        </div>
      </form>
    </div>
  );
}
