import { QuotationDetail } from '@/components/commercial/quotation-detail';

export default async function Page({ params }: { params: Promise<{ quotationId: string }> }) {
  const { quotationId } = await params;
  return <QuotationDetail id={quotationId} />;
}
