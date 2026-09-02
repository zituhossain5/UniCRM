import { ProjectDetail } from '@/components/work/project-detail';

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <ProjectDetail id={projectId} />;
}
