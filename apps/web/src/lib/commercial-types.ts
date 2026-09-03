import type { ListResponse } from './work-types';

export type QuotationStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
export type PaymentMethod =
  'BANK_TRANSFER' | 'CASH' | 'CARD' | 'MOBILE_BANKING' | 'CHEQUE' | 'OTHER';

export interface QuotationRecord {
  id: string;
  quotationNumber: string;
  companyId: string;
  contactId: string | null;
  leadId: string | null;
  projectId: string | null;
  company: { id: string; name: string };
  contact: { id: string; firstName: string; lastName: string; email?: string | null } | null;
  lead: { id: string; title: string } | null;
  project: { id: string; name: string } | null;
  status: QuotationStatus;
  issueDate: string;
  expiryDate: string | null;
  currency: string;
  subtotal: string;
  discountType: 'PERCENTAGE' | 'FIXED' | null;
  discountValue: string | null;
  discountAmount: string;
  taxRate: string | null;
  taxAmount: string;
  total: string;
  notes: string | null;
  terms: string | null;
  sentAt: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  pdfSnapshotAt: string | null;
  items: Array<{
    id: string;
    description: string;
    quantity: string;
    unitPrice: string;
    amount: string;
    position: number;
  }>;
  payments: PaymentRecord[];
  paid: string;
  remaining: string;
  _count?: { items: number };
}

export interface PaymentRecord {
  id: string;
  companyId: string;
  projectId: string | null;
  quotationId: string | null;
  company: { id: string; name: string };
  project: { id: string; name: string } | null;
  quotation: { id: string; quotationNumber: string; total: string } | null;
  amount: string;
  currency: string;
  paymentDate: string;
  method: PaymentMethod | null;
  reference: string | null;
  notes: string | null;
}

export interface CommercialReferences {
  companies: Array<{ id: string; name: string }>;
  contacts?: Array<{ id: string; companyId: string | null; firstName: string; lastName: string }>;
  leads?: Array<{
    id: string;
    companyId: string | null;
    contactId: string | null;
    title: string;
    estimatedValue: string | null;
    currency: string;
  }>;
  projects: Array<{ id: string; companyId: string; name: string; currency: string }>;
  quotations?: Array<{
    id: string;
    companyId: string;
    projectId: string | null;
    quotationNumber: string;
    currency: string;
    total: string;
  }>;
  users?: Array<{ id: string; firstName: string; lastName: string }>;
}

export type QuotationListResponse = ListResponse<QuotationRecord>;
export type PaymentListResponse = ListResponse<PaymentRecord>;

export function formatMoney(value: string | number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(Number(value));
}
