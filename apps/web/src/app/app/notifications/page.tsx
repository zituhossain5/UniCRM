import { PageHeader } from '@unicrm/ui';
import { NotificationBellContent } from '@/components/operational/notification-center';
export default function Page() {
  return (
    <section className="operational-page">
      <PageHeader title="Notifications" description="Your personal attention queue." />
      <NotificationBellContent compact={false} />
    </section>
  );
}
