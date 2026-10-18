'use client';

import { AuthAlert, authErrorMessage } from '@/components/auth/auth-feedback';
import { AuthPasswordField, AuthSubmitButton } from '@/components/auth/auth-fields';
import { AuthShell } from '@/components/auth/auth-shell';
import { apiRequest } from '@/lib/api';
import { ArrowLeft, CircleCheck, Link2Off } from 'lucide-react';
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
      setError(authErrorMessage(cause, 'Password reset failed.'));
    } finally {
      setLoading(false);
    }
  }

  if (complete)
    return (
      <AuthShell
        badge={{ icon: CircleCheck, tone: 'success' }}
        description="Your password has been reset. All existing sessions were signed out."
        eyebrow="All set"
        title="Password updated"
      >
        <div className="auth-form">
          <Link className="ui-button ui-button--primary auth-submit" href="/login">
            Return to sign in
          </Link>
        </div>
      </AuthShell>
    );

  if (!token)
    return (
      <AuthShell
        badge={{ icon: Link2Off, tone: 'danger' }}
        description="The reset link is incomplete. Request a new link to choose a password."
        eyebrow="Account recovery"
        title="This link can't be used"
      >
        <div className="auth-form">
          <div className="auth-actions">
            <Link className="ui-button ui-button--primary auth-submit" href="/forgot-password">
              Request a new link
            </Link>
            <Link className="auth-back-link" href="/login">
              <ArrowLeft aria-hidden="true" size={15} strokeWidth={2} />
              Back to sign in
            </Link>
          </div>
        </div>
      </AuthShell>
    );

  return (
    <AuthShell
      description="Choose a strong password with at least 12 characters."
      eyebrow="Account recovery"
      title="Choose a new password"
    >
      <form className="auth-form" onSubmit={(event) => void submit(event)}>
        <AuthPasswordField
          aria-describedby={error ? 'reset-error' : undefined}
          autoComplete="new-password"
          id="reset-password"
          label="New password"
          minLength={12}
          name="password"
          placeholder="At least 12 characters"
          required
        />
        <AuthPasswordField
          aria-describedby={error ? 'reset-error' : undefined}
          autoComplete="new-password"
          id="reset-confirm-password"
          label="Confirm password"
          minLength={12}
          name="confirmPassword"
          placeholder="Re-enter your new password"
          required
        />
        {error ? (
          <AuthAlert id="reset-error" tone="error">
            {error}
          </AuthAlert>
        ) : null}
        <div className="auth-actions">
          <AuthSubmitButton loading={loading} loadingLabel="Updating password…">
            Reset password
          </AuthSubmitButton>
          <Link className="auth-back-link" href="/login">
            <ArrowLeft aria-hidden="true" size={15} strokeWidth={2} />
            Back to sign in
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}
