'use client';

import { AuthAlert, AuthTrustNote, authErrorMessage } from '@/components/auth/auth-feedback';
import { AuthPasswordField, AuthSubmitButton, AuthTextField } from '@/components/auth/auth-fields';
import { ApiError, apiRequest, apiUrlForRuntime } from '@/lib/api';
import { AtSign } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';

export function LoginForm({ demoExpired = false }: { demoExpired?: boolean }) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

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

  async function startDemo() {
    setError('');
    setDemoLoading(true);
    try {
      const response = await fetch(apiUrlForRuntime('DEMO', '/demo/start'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      if (!response.ok) {
        throw new ApiError('The demo environment is currently unavailable.', response.status);
      }
      window.location.assign('/demo');
    } catch (cause) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Demo start request failed', {
          errorName: cause instanceof Error ? cause.name : 'UnknownError',
          status: cause instanceof ApiError ? cause.status : undefined,
        });
      }
      setError('The demo environment is currently unavailable.');
      setDemoLoading(false);
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
      {demoExpired && !error ? (
        <AuthAlert tone="success">
          Your demo session has expired. Start a new demo to continue.
        </AuthAlert>
      ) : null}
      <div className="auth-actions">
        <AuthSubmitButton loading={loading} loadingLabel="Signing in…">
          Sign in
        </AuthSubmitButton>
        <AuthTrustNote>Access is managed by your workspace administrator.</AuthTrustNote>
        <div className="auth-demo-divider" role="separator">
          <span>or</span>
        </div>
        <button
          className="ui-button ui-button--outline auth-demo-button"
          disabled={loading || demoLoading}
          onClick={() => void startDemo()}
          type="button"
        >
          {demoLoading ? 'Preparing your demo...' : 'Explore Live Demo'}
        </button>
        <AuthTrustNote>Explore UniCRM with sample data. No account required.</AuthTrustNote>
      </div>
    </form>
  );
}
