import { AuthScreen } from '@/components/auth-screen';
import { LoginForm } from '@/components/login-form';
import { getCurrentUser } from '@/lib/server-auth';
import { redirect } from 'next/navigation';

export default async function LoginPage() {
  if (await getCurrentUser()) redirect('/app/dashboard');
  return (
    <AuthScreen description="Sign in to your organization workspace." title="Welcome back">
      <LoginForm />
    </AuthScreen>
  );
}
