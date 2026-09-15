import { CasesView } from '@/components/cases/cases-view';

export default async function CasesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  return <CasesView initialView={view} />;
}
