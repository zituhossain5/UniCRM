import { LeadDetail } from '@/components/crm/lead-detail';
export default async function Page({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params;
  return <LeadDetail id={leadId} />;
}
