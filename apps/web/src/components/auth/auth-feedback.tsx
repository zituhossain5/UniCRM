import { ApiError } from '@/lib/api';
import { CircleAlert, CircleCheck, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';

const NETWORK_ERROR = "We couldn't reach UniCRM. Check your connection and try again.";

/** Maps a failed auth request to display copy; fetch network failures surface as TypeError. */
export function authErrorMessage(cause: unknown, fallback: string): string {
  if (cause instanceof ApiError) return cause.message;
  if (cause instanceof TypeError) return NETWORK_ERROR;
  return cause instanceof Error ? cause.message : fallback;
}

export function AuthAlert({
  children,
  id,
  tone = 'error',
}: {
  children: ReactNode;
  id?: string;
  tone?: 'error' | 'success';
}) {
  const Icon = tone === 'error' ? CircleAlert : CircleCheck;
  return (
    <div
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      className={`auth-alert auth-alert--${tone}`}
      id={id}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <Icon aria-hidden="true" size={17} strokeWidth={2} />
      <p>{children}</p>
    </div>
  );
}

export function AuthTrustNote({ children }: { children: ReactNode }) {
  return (
    <p className="auth-trust-note">
      <ShieldCheck aria-hidden="true" size={14} strokeWidth={2} />
      {children}
    </p>
  );
}
