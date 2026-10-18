'use client';

import { AuthAlert, AuthTrustNote, authErrorMessage } from '@/components/auth/auth-feedback';
import { AuthPasswordField, AuthSubmitButton, AuthTextField } from '@/components/auth/auth-fields';
import { apiRequest } from '@/lib/api';
import { AtSign } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';

export function LoginForm() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);
    const data = new FormData(event.currentTarget);
    try {
      await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: data.get('email'), password: data.get('password') }),
      });
      window.location.assign('/app/dashboard');
    } catch (cause) {
      setError(authErrorMessage(cause, 'Sign in failed.'));
      setLoading(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={(event) => void submit(event)}>
      <AuthTextField
        aria-describedby={error ? 'login-error' : undefined}
        autoComplete="email"
        icon={AtSign}
        id="login-email"
        invalid={Boolean(error)}
        label="Email address"
        name="email"
        placeholder="you@company.com"
        required
        type="email"
      />
      <AuthPasswordField
        aria-describedby={error ? 'login-error' : undefined}
        autoComplete="current-password"
        id="login-password"
        invalid={Boolean(error)}
        label="Password"
        labelAction={
          <Link className="auth-link" href="/forgot-password">
            Forgot password?
          </Link>
        }
        name="password"
        placeholder="Enter your password"
        required
      />
      {error ? (
        <AuthAlert id="login-error" tone="error">
          {error}
        </AuthAlert>
      ) : null}
      <div className="auth-actions">
        <AuthSubmitButton loading={loading} loadingLabel="Signing in…">
          Sign in
        </AuthSubmitButton>
        <AuthTrustNote>Access is managed by your workspace administrator.</AuthTrustNote>
      </div>
    </form>
  );
}
