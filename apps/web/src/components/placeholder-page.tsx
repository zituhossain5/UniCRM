import { EmptyState, PageHeader } from '@unicrm/ui';
import { Blocks } from 'lucide-react';

export function PlaceholderPage({ description, title }: { description: string; title: string }) {
  return (
    <div className="page-container">
      <PageHeader description="Workspace" title={title} />
      <section className="placeholder-surface">
        <EmptyState
          description={description}
          icon={<Blocks size={20} />}
          title={`${title} is ready for its product milestone`}
        />
      </section>
    </div>
  );
}
