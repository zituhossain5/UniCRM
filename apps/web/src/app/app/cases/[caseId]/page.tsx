import { CaseDetail } from '@/components/cases/case-detail';

export default async function Page({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  return <CaseDetail id={caseId} />;
}
