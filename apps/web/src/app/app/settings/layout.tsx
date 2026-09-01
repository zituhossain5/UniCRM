import { PageHeader } from '@unicrm/ui';
import { SettingsNav } from '@/components/settings/settings-nav';
import type { ReactNode } from 'react';

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="settings-page">
      <PageHeader
        description="Manage your workspace identity, access, and security."
        title="Settings"
      />
      <SettingsNav />
      <div className="settings-content">{children}</div>
    </div>
  );
}
