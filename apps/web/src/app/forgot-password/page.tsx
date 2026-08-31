'use client';

import { AuthMessage, AuthScreen } from '@/components/auth-screen';
import { apiRequest } from '@/lib/api';
import { Button, Input } from '@unicrm/ui';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';

export default function ForgotPasswordPage() {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);
    const data = new FormData(event.currentTarget);
    try {
      const result = await apiRequest<{ message: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: data.get('email') }),
      });
      setMessage(result.message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Request failed.');
    } finally {
      setLoading(false);
    }
  }
  return (
    <AuthScreen
      description="We will send instructions if the account is available."
      title="Reset your password"
    >
      <form className="auth-form" onSubmit={(event) => void submit(event)}>
        <label>
          <span>Email</span>
          <Input autoComplete="email" name="email" required type="email" />
        </label>
        {message ? <AuthMessage tone="success">{message}</AuthMessage> : null}
        {error ? <AuthMessage>{error}</AuthMessage> : null}
        <Button loading={loading} type="submit">
          Send reset instructions
        </Button>
        <Link className="text-link auth-link" href="/login">
          Back to sign in
        </Link>
      </form>
    </AuthScreen>
  );
}
