'use client';

import { SettingsNav } from '@/components/settings/settings-nav';
import { PageHeader } from '@unicrm/ui';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export function SettingsLayoutFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAutomationEditor =
    pathname.startsWith('/app/settings/automations/') && pathname !== '/app/settings/automations/';

  if (isAutomationEditor) return <div className="settings-editor-route">{children}</div>;

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
