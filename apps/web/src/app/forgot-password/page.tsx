'use client';

import { AuthAlert, authErrorMessage } from '@/components/auth/auth-feedback';
import { AuthSubmitButton, AuthTextField } from '@/components/auth/auth-fields';
import { AuthShell } from '@/components/auth/auth-shell';
import { apiRequest } from '@/lib/api';
import { ArrowLeft, AtSign, MailCheck } from 'lucide-react';
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
      setError(authErrorMessage(cause, 'Request failed.'));
    } finally {
      setLoading(false);
    }
  }

  if (message)
    return (
      <AuthShell
        badge={{ icon: MailCheck, tone: 'success' }}
        description={message}
        eyebrow="Check your inbox"
        title="Instructions on the way"
      >
        <div className="auth-form">
          <div className="auth-actions">
            <Link className="ui-button ui-button--primary auth-submit" href="/login">
              Return to sign in
            </Link>
            <button className="auth-secondary-action" onClick={() => setMessage('')} type="button">
              Use a different email
            </button>
          </div>
        </div>
      </AuthShell>
    );

  return (
    <AuthShell
      description="Enter your work email and we will send reset instructions if the account is available."
      eyebrow="Account recovery"
      title="Reset your password"
    >
      <form className="auth-form" onSubmit={(event) => void submit(event)}>
        <AuthTextField
          aria-describedby={error ? 'forgot-error' : undefined}
          autoComplete="email"
          icon={AtSign}
          id="forgot-email"
          invalid={Boolean(error)}
          label="Email address"
          name="email"
          placeholder="you@company.com"
          required
          type="email"
        />
        {error ? (
          <AuthAlert id="forgot-error" tone="error">
            {error}
          </AuthAlert>
        ) : null}
        <div className="auth-actions">
          <AuthSubmitButton loading={loading} loadingLabel="Sending instructions…">
            Send reset instructions
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
