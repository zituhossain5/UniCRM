'use client';

import { AuthMessage } from '@/components/auth-screen';
import { AuthPasswordField } from '@/components/auth-password-field';
import { apiRequest } from '@/lib/api';
import { Button, Input } from '@unicrm/ui';
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
      setError(cause instanceof Error ? cause.message : 'Sign in failed.');
      setLoading(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={(event) => void submit(event)}>
      <label htmlFor="login-email">
        <span>Email</span>
        <Input
          aria-describedby={error ? 'login-error' : undefined}
          autoComplete="email"
          id="login-email"
          invalid={Boolean(error)}
          name="email"
          required
          type="email"
        />
      </label>
      <AuthPasswordField
        aria-describedby={error ? 'login-error' : undefined}
        autoComplete="current-password"
        id="login-password"
        invalid={Boolean(error)}
        label="Password"
        name="password"
        required
      />
      <div className="auth-form-meta">
        <Link className="text-link auth-link" href="/forgot-password">
          Forgot password?
        </Link>
      </div>
      {error ? (
        <div id="login-error">
          <AuthMessage>{error}</AuthMessage>
        </div>
      ) : null}
      <Button loading={loading} type="submit">
        Sign in
      </Button>
    </form>
  );
}
