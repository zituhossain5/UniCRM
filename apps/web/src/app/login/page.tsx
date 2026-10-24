import { AuthShell } from '@/components/auth/auth-shell';
import { LoginForm } from '@/components/login-form';
import { getCurrentUser } from '@/lib/server-auth';
import { redirect } from 'next/navigation';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ demoExpired?: string }>;
}) {
  if (await getCurrentUser()) redirect('/app/dashboard');
  const params = await searchParams;
  return (
    <AuthShell
      description="Access your workspace and continue managing your customer relationships."
      eyebrow="Welcome back"
      title="Sign in to UniCRM"
    >
      <LoginForm demoExpired={params.demoExpired === '1'} />
    </AuthShell>
  );
}
