'use client';

import { AuthMessage } from '@/components/auth-screen';
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
      <label>
        <span>Email</span>
        <Input autoComplete="email" name="email" required type="email" />
      </label>
      <label>
        <span>Password</span>
        <Input autoComplete="current-password" name="password" required type="password" />
      </label>
      {error ? <AuthMessage>{error}</AuthMessage> : null}
      <Button loading={loading} type="submit">
        Sign in
      </Button>
      <Link className="text-link auth-link" href="/forgot-password">
        Forgot password?
      </Link>
    </form>
  );
}
