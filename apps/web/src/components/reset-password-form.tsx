'use client';

import { AuthMessage, AuthScreen } from '@/components/auth-screen';
import { apiRequest } from '@/lib/api';
import { Button, Input } from '@unicrm/ui';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';

export function ResetPasswordForm({ token }: { token: string }) {
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const data = new FormData(event.currentTarget);
    if (data.get('password') !== data.get('confirmPassword'))
      return setError('Passwords do not match.');
    setLoading(true);
    try {
      await apiRequest('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password: data.get('password') }),
      });
      setComplete(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Password reset failed.');
    } finally {
      setLoading(false);
    }
  }
  return (
    <AuthScreen
      description="Choose a strong password with at least 12 characters."
      title="Choose a new password"
    >
      {complete ? (
        <div className="auth-form">
          <AuthMessage tone="success">
            Your password has been reset. All existing sessions were signed out.
          </AuthMessage>
          <Link className="ui-button ui-button--primary" href="/login">
            Return to sign in
          </Link>
        </div>
      ) : token ? (
        <form className="auth-form" onSubmit={(event) => void submit(event)}>
          <label>
            <span>New password</span>
            <Input
              autoComplete="new-password"
              minLength={12}
              name="password"
              required
              type="password"
            />
          </label>
          <label>
            <span>Confirm password</span>
            <Input
              autoComplete="new-password"
              minLength={12}
              name="confirmPassword"
              required
              type="password"
            />
          </label>
          {error ? <AuthMessage>{error}</AuthMessage> : null}
          <Button loading={loading} type="submit">
            Reset password
          </Button>
        </form>
      ) : (
        <AuthMessage>The reset link is incomplete.</AuthMessage>
      )}
    </AuthScreen>
  );
}
