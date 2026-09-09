'use client';

import { AuthMessage, AuthScreen } from '@/components/auth-screen';
import { AuthPasswordField } from '@/components/auth-password-field';
import { apiRequest } from '@/lib/api';
import { Button, LoadingState } from '@unicrm/ui';
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
        setError(cause instanceof Error ? cause.message : 'Invitation validation failed.'),
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
      setError(cause instanceof Error ? cause.message : 'Invitation acceptance failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthScreen
      description={
        details
          ? `${details.organizationName} invited you as ${details.role}.`
          : 'Validate your invitation and create your account.'
      }
      title="Join UniCRM"
    >
      {complete ? (
        <div className="auth-form">
          <AuthMessage tone="success">Your account is active.</AuthMessage>
          <Link className="ui-button ui-button--primary" href="/login">
            Sign in
          </Link>
        </div>
      ) : details ? (
        <form className="auth-form" onSubmit={(event) => void submit(event)}>
          <div className="auth-invitee">
            <strong>
              {details.firstName} {details.lastName}
            </strong>
            <span>{details.email}</span>
          </div>
          <AuthPasswordField
            autoComplete="new-password"
            id="invitation-password"
            label="Password"
            minLength={12}
            name="password"
            required
          />
          <AuthPasswordField
            autoComplete="new-password"
            id="invitation-confirm-password"
            label="Confirm password"
            minLength={12}
            name="confirmPassword"
            required
          />
          {error ? <AuthMessage>{error}</AuthMessage> : null}
          <Button loading={loading} type="submit">
            Accept invitation
          </Button>
        </form>
      ) : error ? (
        <AuthMessage>{error}</AuthMessage>
      ) : (
        <LoadingState label="Validating invitation" />
      )}
    </AuthScreen>
  );
}
