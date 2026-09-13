import { DealDetail } from '@/components/crm/deal-detail';

export default async function Page({ params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await params;
  return <DealDetail id={dealId} />;
}
