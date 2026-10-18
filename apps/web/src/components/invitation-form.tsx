'use client';

import { AuthAlert, AuthTrustNote, authErrorMessage } from '@/components/auth/auth-feedback';
import { AuthPasswordField, AuthSubmitButton } from '@/components/auth/auth-fields';
import { AuthShell } from '@/components/auth/auth-shell';
import { apiRequest } from '@/lib/api';
import { LoadingState } from '@unicrm/ui';
import { ArrowLeft, CircleCheck, TimerOff } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';

interface InvitationDetails {
  email: string;
  firstName: string;
  lastName: string;
  organizationName: string;
  role: string;
  expiresAt: string;
}

export function InvitationForm({ token }: { token: string }) {
  const [details, setDetails] = useState<InvitationDetails>();
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return setError('The invitation link is incomplete.');
    void apiRequest<{ data: InvitationDetails }>(
      `/users/invitations/${encodeURIComponent(token)}/validate`,
    )
      .then(({ data }) => setDetails(data))
      .catch((cause: unknown) =>
        setError(authErrorMessage(cause, 'Invitation validation failed.')),
      );
  }, [token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const data = new FormData(event.currentTarget);
    if (data.get('password') !== data.get('confirmPassword'))
      return setError('Passwords do not match.');
    setLoading(true);
    try {
      await apiRequest(`/users/invitations/${encodeURIComponent(token)}/accept`, {
        method: 'POST',
        body: JSON.stringify({ password: data.get('password') }),
      });
      setComplete(true);
    } catch (cause) {
      setError(authErrorMessage(cause, 'Invitation acceptance failed.'));
    } finally {
      setLoading(false);
    }
  }

  if (complete)
    return (
      <AuthShell
        badge={{ icon: CircleCheck, tone: 'success' }}
        description={
          details
            ? `You can now sign in to ${details.organizationName} with your new password.`
            : 'You can now sign in with your new password.'
        }
        eyebrow="Welcome aboard"
        title="Your account is active"
      >
        <div className="auth-form">
          <Link className="ui-button ui-button--primary auth-submit" href="/login">
            Sign in
          </Link>
        </div>
      </AuthShell>
    );

  if (details)
    return (
      <AuthShell
        description={`${details.organizationName} invited you as ${details.role}. Set a password to activate your account.`}
        eyebrow="You're invited"
        title="Join UniCRM"
      >
        <form className="auth-form" onSubmit={(event) => void submit(event)}>
          <div className="auth-invitee">
            <span aria-hidden="true" className="auth-invitee-avatar">
              {details.firstName.charAt(0)}
              {details.lastName.charAt(0)}
            </span>
            <span className="auth-invitee-copy">
              <strong>
                {details.firstName} {details.lastName}
              </strong>
              <span>{details.email}</span>
            </span>
          </div>
          <AuthPasswordField
            aria-describedby={error ? 'invitation-error' : undefined}
            autoComplete="new-password"
            id="invitation-password"
            label="Password"
            minLength={12}
            name="password"
            placeholder="At least 12 characters"
            required
          />
          <AuthPasswordField
            aria-describedby={error ? 'invitation-error' : undefined}
            autoComplete="new-password"
            id="invitation-confirm-password"
            label="Confirm password"
            minLength={12}
            name="confirmPassword"
            placeholder="Re-enter your password"
            required
          />
          {error ? (
            <AuthAlert id="invitation-error" tone="error">
              {error}
            </AuthAlert>
          ) : null}
          <div className="auth-actions">
            <AuthSubmitButton loading={loading} loadingLabel="Activating account…">
              Accept invitation
            </AuthSubmitButton>
            <AuthTrustNote>Access is managed by your workspace administrator.</AuthTrustNote>
          </div>
        </form>
      </AuthShell>
    );

  if (error)
    return (
      <AuthShell
        badge={{ icon: TimerOff, tone: 'warning' }}
        description="Invitations expire for security. Ask your workspace administrator to send you a new one."
        eyebrow="Invitation"
        title="This invitation can't be used"
      >
        <div className="auth-form">
          <AuthAlert tone="error">{error}</AuthAlert>
          <div className="auth-actions">
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
      description="Validating your invitation and preparing your account."
      eyebrow="Invitation"
      title="Join UniCRM"
    >
      <div className="auth-form">
        <LoadingState label="Validating invitation" />
      </div>
    </AuthShell>
  );
}
