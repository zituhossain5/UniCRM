import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { EnvironmentVariables } from '../config/environment';

const BLOCKED_MUTATION_PREFIXES = [
  '/users',
  '/roles',
  '/permissions',
  '/mailboxes',
  '/integrations',
  '/data-management',
];

const BLOCKED_AUTH_PATHS = ['/auth/forgot-password', '/auth/reset-password'];

@Injectable()
export class DemoCapabilityService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  isDemoRuntime(): boolean {
    return this.config.get('RUNTIME_MODE', { infer: true }) === 'demo';
  }

  isBlocked(request: Request): boolean {
    if (!this.isDemoRuntime()) return false;
    const path = this.apiPath(request);
    if (BLOCKED_AUTH_PATHS.some((blocked) => path.startsWith(blocked))) return true;
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      return path.startsWith('/data-management/exports/') && path.endsWith('/download');
    }
    if (BLOCKED_MUTATION_PREFIXES.some((blocked) => path.startsWith(blocked))) return true;
    if (path.startsWith('/organization')) return true;
    if (path.startsWith('/inbound/web-to-lead')) return true;
    if (request.method === 'PATCH' && path.startsWith('/email-settings')) return true;
    if (path === '/auth/logout' || path === '/auth/logout-all') return false;
    return false;
  }

  private apiPath(request: Request): string {
    const path = request.path || request.url.split('?')[0] || '/';
    return path.replace(/^\/api\/v1/, '');
  }
}
