export const DEMO_BLOCKED_EVENT = 'unicrm:demo-action-blocked';

export interface DemoBlockedDetail {
  path: string;
}

export function isDemoExperienceEnabled(mode: 'NORMAL' | 'DEMO'): boolean {
  return mode === 'DEMO';
}

export function demoRestrictionCopy(path: string): string {
  if (path.includes('/mailboxes'))
    return 'Connecting a real mailbox is disabled so the public demo cannot access external email accounts.';
  if (path.includes('/users') || path.includes('/roles') || path.includes('/permissions'))
    return 'Inviting teammates and changing access controls are disabled in the public demo.';
  if (path.includes('/integrations'))
    return 'External integrations and secret configuration are disabled in the public demo.';
  if (path.includes('/data-management'))
    return 'Import, export, and downloadable data operations are disabled in the public demo.';
  return 'This operation is disabled to keep the shared public demo safe and isolated.';
}

export function announceDemoBlocked(path: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<DemoBlockedDetail>(DEMO_BLOCKED_EVENT, { detail: { path } }),
  );
}
