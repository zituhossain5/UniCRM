import { AppShell } from '@/components/app-shell';
import { AuthProvider } from '@/components/auth-provider';
import { getCurrentUser } from '@/lib/server-auth';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';

export default async function ApplicationLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) {
    const requestHeaders = await headers();
    redirect(
      requestHeaders.get('x-unicrm-runtime-mode') === 'demo' ? '/login?demoExpired=1' : '/login',
    );
  }
  return (
    <AuthProvider user={user}>
      <AppShell>{children}</AppShell>
    </AuthProvider>
  );
}
