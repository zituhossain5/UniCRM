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
    <main className="auth-screen">
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
        <p className="auth-owner">UnicodeIT</p>
      </section>
    </main>
  );
}

export function AuthMessage({
  children,
  tone = 'error',
}: {
  children: ReactNode;
  tone?: 'error' | 'success';
}) {
  return <p className={`auth-message auth-message--${tone}`}>{children}</p>;
}
