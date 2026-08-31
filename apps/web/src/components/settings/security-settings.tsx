'use client';

import { AuthMessage } from '@/components/auth-screen';
import { apiRequest } from '@/lib/api';
import type { SessionRecord } from '@/lib/auth-types';
import { Badge, Button, ConfirmationDialog, LoadingState } from '@unicrm/ui';
import { Laptop, LogOut } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

function deviceName(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device';
  const browser = userAgent.includes('Edg/')
    ? 'Edge'
    : userAgent.includes('Chrome/')
      ? 'Chrome'
      : userAgent.includes('Firefox/')
        ? 'Firefox'
        : userAgent.includes('Safari/')
          ? 'Safari'
          : 'Browser';
  const system = userAgent.includes('Windows')
    ? 'Windows'
    : userAgent.includes('Mac OS')
      ? 'macOS'
      : userAgent.includes('Linux')
        ? 'Linux'
        : 'Unknown OS';
  return `${browser} · ${system}`;
}

export function SecuritySettings() {
  const [sessions, setSessions] = useState<SessionRecord[]>();
  const [error, setError] = useState('');
  const load = useCallback(
    () =>
      apiRequest<{ data: SessionRecord[] }>('/auth/sessions')
        .then(({ data }) => setSessions(data))
        .catch((cause: unknown) =>
          setError(cause instanceof Error ? cause.message : 'Could not load sessions.'),
        ),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function revoke(id: string) {
    try {
      await apiRequest(`/auth/sessions/${id}`, { method: 'DELETE' });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Session revocation failed.');
    }
  }
  async function revokeOthers() {
    try {
      await apiRequest('/auth/logout-all', {
        method: 'POST',
        body: JSON.stringify({ exceptCurrent: true }),
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Session revocation failed.');
    }
  }
  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <div>
          <h2>Security</h2>
          <p>Review and revoke your active UniCRM sessions.</p>
        </div>
        {sessions?.some((session) => !session.current) ? (
          <ConfirmationDialog
            confirmLabel="Sign out others"
            description="Every other active session will be revoked immediately."
            onConfirm={() => void revokeOthers()}
            title="Sign out all other sessions?"
            trigger={
              <Button variant="outline">
                <LogOut size={15} />
                Sign out others
              </Button>
            }
          />
        ) : null}
      </header>
      {error ? <AuthMessage>{error}</AuthMessage> : null}
      {!sessions ? (
        <LoadingState label="Loading sessions" />
      ) : (
        <div className="session-list">
          {sessions.map((session) => (
            <article className="session-row" key={session.id}>
              <Laptop size={19} />
              <div>
                <div className="session-title">
                  <strong>{deviceName(session.userAgent)}</strong>
                  {session.current ? <Badge tone="primary">Current session</Badge> : null}
                </div>
                <p>
                  {session.ipAddress ?? 'IP unavailable'} · Last active{' '}
                  {new Date(session.lastUsedAt).toLocaleString()}
                </p>
              </div>
              {!session.current ? (
                <ConfirmationDialog
                  confirmLabel="Revoke"
                  description="This device will need to sign in again."
                  onConfirm={() => void revoke(session.id)}
                  title="Revoke this session?"
                  trigger={<Button variant="outline">Revoke</Button>}
                />
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
