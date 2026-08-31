'use client';

import { useCurrentUser } from '@/components/auth-provider';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function SettingsNav() {
  const user = useCurrentUser();
  const pathname = usePathname();
  const tabs = [
    { label: 'Organization', href: '/app/settings/organization', permission: 'settings.read' },
    { label: 'Users', href: '/app/settings/users', permission: 'user.read' },
    { label: 'Roles & Permissions', href: '/app/settings/roles', permission: 'role.read' },
    { label: 'Security', href: '/app/settings/security', permission: 'security.sessions.read' },
  ];
  return (
    <nav aria-label="Settings" className="settings-tabs">
      {tabs
        .filter((tab) => user.permissions.includes(tab.permission))
        .map((tab) => (
          <Link
            aria-current={pathname === tab.href ? 'page' : undefined}
            href={tab.href}
            key={tab.href}
          >
            {tab.label}
          </Link>
        ))}
    </nav>
  );
}
