'use client';

import { AuthAlert, AuthTrustNote, authErrorMessage } from '@/components/auth/auth-feedback';
import { AuthPasswordField, AuthSubmitButton, AuthTextField } from '@/components/auth/auth-fields';
import { ApiError, apiRequest, apiUrlForRuntime } from '@/lib/api';
import { env } from '@/lib/env';
import { AtSign } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId?: string) => void;
    };
  }
}

export function LoginForm({ demoExpired = false }: { demoExpired?: boolean }) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const turnstileContainer = useRef<HTMLDivElement>(null);
  const turnstileWidget = useRef<string | undefined>(undefined);
  const turnstileSiteKey = env.NEXT_PUBLIC_DEMO_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!turnstileSiteKey) return;
    const render = () => {
      if (!window.turnstile || !turnstileContainer.current || turnstileWidget.current) return;
      turnstileWidget.current = window.turnstile.render(turnstileContainer.current, {
        sitekey: turnstileSiteKey,
        theme: 'auto',
        callback: (token: string) => setTurnstileToken(token),
        'expired-callback': () => setTurnstileToken(''),
        'error-callback': () => setTurnstileToken(''),
      });
    };
    const existing = document.querySelector<HTMLScriptElement>('script[data-unicrm-turnstile]');
    if (existing) {
      if (window.turnstile) render();
      else existing.addEventListener('load', render, { once: true });
    } else {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.dataset.unicrmTurnstile = 'true';
      script.addEventListener('load', render, { once: true });
      document.head.append(script);
    }
    return () => {
      if (turnstileWidget.current && window.turnstile) {
        window.turnstile.remove(turnstileWidget.current);
        turnstileWidget.current = undefined;
      }
      existing?.removeEventListener('load', render);
    };
  }, [turnstileSiteKey]);

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
      setError(authErrorMessage(cause, 'Sign in failed.'));
      setLoading(false);
    }
  }

  async function startDemo() {
    setError('');
    setDemoLoading(true);
    try {
      const response = await fetch(apiUrlForRuntime('DEMO', '/demo/start'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(turnstileToken ? { turnstileToken } : {}),
      });
      if (!response.ok) {
        throw new ApiError('The live demo is temporarily unavailable.', response.status);
      }
      window.location.assign('/demo');
    } catch (cause) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Demo start request failed', {
          errorName: cause instanceof Error ? cause.name : 'UnknownError',
          status: cause instanceof ApiError ? cause.status : undefined,
        });
      }
      setError(
        cause instanceof ApiError && cause.status === 429
          ? 'Too many demo requests. Please try again shortly.'
          : 'The live demo is temporarily unavailable. Please try again shortly.',
      );
      window.turnstile?.reset(turnstileWidget.current);
      setTurnstileToken('');
      setDemoLoading(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={(event) => void submit(event)}>
      <AuthTextField
        aria-describedby={error ? 'login-error' : undefined}
        autoComplete="email"
        icon={AtSign}
        id="login-email"
        invalid={Boolean(error)}
        label="Email address"
        name="email"
        placeholder="you@company.com"
        required
        type="email"
      />
      <AuthPasswordField
        aria-describedby={error ? 'login-error' : undefined}
        autoComplete="current-password"
        id="login-password"
        invalid={Boolean(error)}
        label="Password"
        labelAction={
          <Link className="auth-link" href="/forgot-password">
            Forgot password?
          </Link>
        }
        name="password"
        placeholder="Enter your password"
        required
      />
      {error ? (
        <AuthAlert id="login-error" tone="error">
          {error}
        </AuthAlert>
      ) : null}
      {demoExpired && !error ? (
        <AuthAlert tone="success">
          Your demo session has expired. Start a new demo to continue exploring UniCRM.
        </AuthAlert>
      ) : null}
      <div className="auth-actions">
        <AuthSubmitButton loading={loading} loadingLabel="Signing in…">
          Sign in
        </AuthSubmitButton>
        <AuthTrustNote>Access is managed by your workspace administrator.</AuthTrustNote>
        <div className="auth-demo-divider" role="separator">
          <span>or</span>
        </div>
        {turnstileSiteKey ? <div ref={turnstileContainer} aria-label="Demo verification" /> : null}
        <button
          className="ui-button ui-button--outline auth-demo-button"
          disabled={loading || demoLoading || Boolean(turnstileSiteKey && !turnstileToken)}
          onClick={() => void startDemo()}
          type="button"
        >
          {demoLoading ? 'Preparing your demo...' : 'Explore Live Demo'}
        </button>
        <AuthTrustNote>Explore UniCRM with sample data. No account required.</AuthTrustNote>
      </div>
    </form>
  );
}
