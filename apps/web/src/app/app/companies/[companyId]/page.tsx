import { CompanyDetail } from '@/components/crm/company-detail';
export default async function Page({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  return <CompanyDetail id={companyId} />;
}
