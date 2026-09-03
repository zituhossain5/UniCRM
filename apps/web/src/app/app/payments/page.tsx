import { PaymentsView } from '@/components/commercial/payments-view';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const value = (key: string) => (typeof query[key] === 'string' ? query[key] : '');
  return (
    <PaymentsView
      initialCompanyId={value('companyId')}
      initialProjectId={value('projectId')}
      initialQuotationId={value('quotationId')}
      initialOpen={value('record') === '1'}
    />
  );
}
