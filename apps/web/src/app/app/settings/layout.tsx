import { SettingsLayoutFrame } from '@/components/settings/settings-layout-frame';
import type { ReactNode } from 'react';

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return <SettingsLayoutFrame>{children}</SettingsLayoutFrame>;
}
