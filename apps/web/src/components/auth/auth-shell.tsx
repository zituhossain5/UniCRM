import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ChartNoAxesCombined, ListChecks, MessagesSquare } from 'lucide-react';
import type { ReactNode } from 'react';
import { BrandLogo } from '@/components/brand-logo';

export type AuthBadgeTone = 'success' | 'warning' | 'danger';

export interface AuthBadge {
  icon: LucideIcon;
  tone: AuthBadgeTone;
}

interface AuthShellProps {
  children: ReactNode;
  eyebrow: string;
  title: string;
  description: ReactNode;
  badge?: AuthBadge;
}

export function AuthShell({ children, ...header }: AuthShellProps) {
  return (
    <div className="auth-shell">
      <AuthBrandPanel />
      <AuthWorkspacePanel {...header}>{children}</AuthWorkspacePanel>
    </div>
  );
}

const VALUE_POINTS: Array<{ icon: LucideIcon; title: string; detail: string }> = [
  {
    icon: ChartNoAxesCombined,
    title: 'Sales pipeline visibility',
    detail: 'Every deal, stage and forecast at a glance.',
  },
  {
    icon: MessagesSquare,
    title: 'Shared customer communication',
    detail: 'One timeline for every email and touchpoint.',
  },
  {
    icon: ListChecks,
    title: 'Projects, tasks & support in one place',
    detail: 'Delivery and service, connected to the account.',
  },
];

export function AuthBrandPanel() {
  return (
    <aside aria-label="About UniCRM" className="auth-brand-panel">
      <AuthBrandDecor />
      <div className="auth-brand-content">
        <AuthBrandMark className="auth-brand-mark--inverse" />
        <div className="auth-brand-story">
          <p className="auth-eyebrow auth-eyebrow--inverse">Customer operations</p>
          <p className="auth-brand-headline">
            One workspace.
            <span>Every customer relationship.</span>
          </p>
          <p className="auth-brand-copy">
            Bring sales, projects, communication and customer support into one connected workspace.
          </p>
          <ul className="auth-brand-points">
            {VALUE_POINTS.map(({ icon: Icon, title, detail }) => (
              <li key={title}>
                <span className="auth-brand-point-icon">
                  <Icon aria-hidden="true" size={17} strokeWidth={1.8} />
                </span>
                <span>
                  <strong>{title}</strong>
                  <small>{detail}</small>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="auth-brand-signature">
          UniCRM <span aria-hidden="true">•</span> Customer operations platform
        </p>
      </div>
    </aside>
  );
}

function AuthBrandDecor() {
  return (
    <svg
      aria-hidden="true"
      className="auth-brand-decor"
      focusable="false"
      preserveAspectRatio="xMidYMid slice"
      viewBox="0 0 800 900"
    >
      <g className="auth-decor-orbit">
        <circle cx="640" cy="170" r="290" />
        <circle cx="640" cy="170" r="190" />
        <circle cx="70" cy="900" r="340" />
      </g>
      <g className="auth-decor-contours">
        <path d="M-40 690 C 180 610, 400 770, 840 630" />
        <path d="M-40 730 C 190 650, 410 810, 840 670" />
        <path d="M-40 770 C 200 690, 420 850, 840 710" />
        <path d="M-40 810 C 210 730, 430 890, 840 750" />
      </g>
      <g className="auth-decor-network" transform="translate(-70 10)">
        <path d="M520 250 L600 130 L690 215 L615 315 L520 250 L615 315 L735 345 L690 215" />
        <circle cx="600" cy="130" r="4" />
        <circle cx="520" cy="250" r="3" />
        <circle cx="615" cy="315" r="3.5" />
        <circle cx="735" cy="345" r="3" />
        <circle className="auth-decor-node--active" cx="690" cy="215" r="5" />
        <circle className="auth-decor-node-ring" cx="690" cy="215" r="14" />
      </g>
    </svg>
  );
}

export function AuthBrandMark({ className }: { className?: string }) {
  return (
    <Link
      aria-label="UniCRM by UnicodeIT"
      className={`auth-brand-mark${className ? ` ${className}` : ''}`}
      href="/login"
    >
      <BrandLogo size={40} />
      <span className="auth-brand-mark-copy">
        <strong>UniCRM</strong>
        <small>UnicodeIT</small>
      </span>
    </Link>
  );
}

export function AuthWorkspacePanel({
  children,
  eyebrow,
  title,
  description,
  badge,
}: AuthShellProps) {
  const BadgeIcon = badge?.icon;
  return (
    <main className="auth-workspace">
      <div className="auth-workspace-top">
        <AuthBrandMark />
      </div>
      <div className="auth-workspace-body">
        <div className="auth-column">
          <header className="auth-header">
            {badge && BadgeIcon ? (
              <span className={`auth-badge auth-badge--${badge.tone}`}>
                <BadgeIcon aria-hidden="true" size={22} strokeWidth={1.9} />
              </span>
            ) : null}
            <p className="auth-eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            <p className="auth-description">{description}</p>
          </header>
          {children}
        </div>
      </div>
      <AuthFooter />
    </main>
  );
}

export function AuthFooter() {
  return (
    <footer className="auth-footer">
      Powered by <span>UnicodeIT</span>
    </footer>
  );
}
