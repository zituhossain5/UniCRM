import { AppShell } from '@/components/app-shell';
import { AuthProvider } from '@/components/auth-provider';
import { getCurrentUser } from '@/lib/server-auth';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

export default async function ApplicationLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return (
    <AuthProvider user={user}>
      <AppShell>{children}</AppShell>
    </AuthProvider>
  );
}
