import { QuotationEditor } from '@/components/commercial/quotation-editor';

export default async function Page({ params }: { params: Promise<{ quotationId: string }> }) {
  const { quotationId } = await params;
  return <QuotationEditor quotationId={quotationId} />;
}
