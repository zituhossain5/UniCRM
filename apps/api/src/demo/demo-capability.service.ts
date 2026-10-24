import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { EnvironmentVariables } from '../config/environment';

export type DemoCapability = 'ALLOW' | 'ALLOW_WITH_LIMITS' | 'SIMULATE' | 'BLOCK';

export interface DemoCapabilityRule {
  capability: DemoCapability;
  description: string;
  matches: (method: string, path: string) => boolean;
}

const readMethod = (method: string) => ['GET', 'HEAD', 'OPTIONS'].includes(method);
const mutates = (method: string) => !readMethod(method);
const startsWith = (path: string, prefix: string) =>
  path === prefix || path.startsWith(`${prefix}/`);

/** Ordered, backend-authoritative policy for every route exposed by a demo runtime. */
export const DEMO_CAPABILITY_MATRIX: readonly DemoCapabilityRule[] = [
  {
    capability: 'BLOCK',
    description: 'Development-only diagnostics',
    matches: (_method, path) => startsWith(path, '/dev'),
  },
  {
    capability: 'ALLOW',
    description: 'Operational health',
    matches: (_method, path) => startsWith(path, '/health'),
  },
  {
    capability: 'ALLOW_WITH_LIMITS',
    description: 'Demo lifecycle',
    matches: (method, path) => method === 'POST' && startsWith(path, '/demo'),
  },
  {
    capability: 'BLOCK',
    description: 'Password delivery and credential reset',
    matches: (_method, path) =>
      startsWith(path, '/auth/forgot-password') || startsWith(path, '/auth/reset-password'),
  },
  {
    capability: 'ALLOW',
    description: 'Current demo session and logout',
    matches: (_method, path) =>
      path === '/auth/me' || path === '/auth/logout' || path === '/auth/logout-all',
  },
  {
    capability: 'BLOCK',
    description: 'Identity, role, and permission administration',
    matches: (method, path) =>
      mutates(method) &&
      ['/users', '/roles', '/permissions'].some((prefix) => startsWith(path, prefix)),
  },
  {
    capability: 'BLOCK',
    description: 'Mailbox and external integration administration',
    matches: (method, path) =>
      mutates(method) &&
      ((startsWith(path, '/mailboxes') && !startsWith(path, '/mailboxes/threads')) ||
        startsWith(path, '/integrations') ||
        startsWith(path, '/inbound/web-to-lead')),
  },
  {
    capability: 'BLOCK',
    description: 'Import, export, organization, and security changes',
    matches: (method, path) =>
      startsWith(path, '/data-management') ||
      (mutates(method) &&
        (startsWith(path, '/organization') || startsWith(path, '/email-settings'))),
  },
  {
    capability: 'SIMULATE',
    description: 'Outbound email and webhook delivery',
    matches: (method, path) =>
      mutates(method) &&
      (startsWith(path, '/emails') ||
        /\/(?:mail|mailboxes)\/threads\/[^/]+\/reply$/.test(path) ||
        /\/integrations\/webhooks\/[^/]+\/deliver/.test(path)),
  },
  {
    capability: 'ALLOW_WITH_LIMITS',
    description: 'Reports, forecast, search, history, and saved queries',
    matches: (_method, path) =>
      /\/(search|reports|forecast|activities|follow-ups|saved-views)(\/|$)/.test(path),
  },
  {
    capability: 'ALLOW_WITH_LIMITS',
    description: 'Attachments',
    matches: (_method, path) => startsWith(path, '/attachments'),
  },
  {
    capability: 'ALLOW_WITH_LIMITS',
    description: 'Bounded CRM mutations',
    matches: (method) => mutates(method),
  },
  {
    capability: 'ALLOW',
    description: 'Tenant-scoped CRM reads',
    matches: () => true,
  },
];

@Injectable()
export class DemoCapabilityService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  isDemoRuntime(): boolean {
    return this.config.get('RUNTIME_MODE', { infer: true }) === 'demo';
  }

  isBlocked(request: Request): boolean {
    return this.classify(request) === 'BLOCK';
  }

  classify(request: Pick<Request, 'method' | 'path' | 'url'>): DemoCapability {
    if (!this.isDemoRuntime()) return 'ALLOW';
    const path = this.apiPath(request);
    return (
      DEMO_CAPABILITY_MATRIX.find((rule) => rule.matches(request.method.toUpperCase(), path))
        ?.capability ?? 'BLOCK'
    );
  }

  apiPath(request: Pick<Request, 'path' | 'url'>): string {
    const path = request.path || request.url.split('?')[0] || '/';
    return path.replace(/^\/api\/v1/, '');
  }
}
