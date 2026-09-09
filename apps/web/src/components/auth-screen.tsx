import Link from 'next/link';
import type { ReactNode } from 'react';

export function AuthScreen({
  children,
  title,
  description,
}: {
  children: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="auth-screen">
      <main className="auth-main">
        <section className="auth-panel">
          <Link className="auth-brand" href="/login">
            <span className="brand-symbol">U</span>
            <span>UniCRM</span>
          </Link>
          <header>
            <h1>{title}</h1>
            <p>{description}</p>
          </header>
          {children}
        </section>
      </main>
      <footer className="auth-footer">
        Powered by <span>UnicodeIT</span>
      </footer>
    </div>
  );
}

export function AuthMessage({
  children,
  tone = 'error',
}: {
  children: ReactNode;
  tone?: 'error' | 'success';
}) {
  return (
    <p
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      className={`auth-message auth-message--${tone}`}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      {children}
    </p>
  );
}
