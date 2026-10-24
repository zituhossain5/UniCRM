import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import type { EnvironmentVariables } from '../config/environment';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';
import { DEMO_QUOTA_MESSAGE } from './demo.constants';

type QuotaResource =
  | 'lead'
  | 'deal'
  | 'company'
  | 'contact'
  | 'project'
  | 'task'
  | 'case'
  | 'activity'
  | 'savedView'
  | 'customFieldDefinition'
  | 'tag'
  | 'automationRule'
  | 'notification';

const CREATE_ROUTES: ReadonlyArray<{
  resource: QuotaResource;
  path: RegExp;
  setting: keyof EnvironmentVariables;
}> = [
  { resource: 'lead', path: /^\/leads\/?$/, setting: 'DEMO_QUOTA_LEADS' },
  { resource: 'deal', path: /^\/deals\/?$/, setting: 'DEMO_QUOTA_DEALS' },
  { resource: 'company', path: /^\/companies\/?$/, setting: 'DEMO_QUOTA_COMPANIES' },
  { resource: 'contact', path: /^\/contacts\/?$/, setting: 'DEMO_QUOTA_CONTACTS' },
  { resource: 'project', path: /^\/projects\/?$/, setting: 'DEMO_QUOTA_PROJECTS' },
  { resource: 'task', path: /^\/tasks\/?$/, setting: 'DEMO_QUOTA_TASKS' },
  { resource: 'case', path: /^\/cases\/?$/, setting: 'DEMO_QUOTA_CASES' },
  { resource: 'activity', path: /^\/activities\/?$/, setting: 'DEMO_QUOTA_ACTIVITIES' },
  { resource: 'savedView', path: /^\/saved-views\/?$/, setting: 'DEMO_QUOTA_SAVED_VIEWS' },
  {
    resource: 'customFieldDefinition',
    path: /^\/custom-fields\/?$/,
    setting: 'DEMO_QUOTA_CUSTOM_FIELDS',
  },
  { resource: 'tag', path: /^\/tags\/?$/, setting: 'DEMO_QUOTA_TAGS' },
  {
    resource: 'automationRule',
    path: /^\/automations\/?$/,
    setting: 'DEMO_QUOTA_AUTOMATIONS',
  },
  {
    resource: 'notification',
    path: /^\/notifications\/?$/,
    setting: 'DEMO_QUOTA_NOTIFICATIONS',
  },
];

@Injectable()
export class DemoQuotaService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<EnvironmentVariables, true>,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RedisService) private readonly redis: RedisService,
  ) {}

  async assertRequestAllowed(
    request: Pick<Request, 'method' | 'path' | 'url'>,
    principal: AuthenticatedPrincipal,
  ): Promise<void> {
    if (request.method !== 'POST') return;
    const path = (request.path || request.url.split('?')[0] || '/').replace(/^\/api\/v1/, '');
    const quota = CREATE_ROUTES.find((entry) => entry.path.test(path));
    if (!quota) return;
    const count = await this.count(quota.resource, principal.organizationId);
    const limit = Number(this.config.get(quota.setting, { infer: true }));
    const reserved = await this.redis.reserveBounded(
      `demo:quota:${principal.organizationId}:${quota.resource}`,
      count,
      limit,
      this.config.get('DEMO_SESSION_TTL_SECONDS', { infer: true }),
    );
    if (!reserved) throw new ConflictException(DEMO_QUOTA_MESSAGE);
  }

  private count(resource: QuotaResource, organizationId: string): Promise<number> {
    const where = { organizationId };
    switch (resource) {
      case 'lead':
        return this.prisma.lead.count({ where });
      case 'deal':
        return this.prisma.deal.count({ where });
      case 'company':
        return this.prisma.company.count({ where });
      case 'contact':
        return this.prisma.contact.count({ where });
      case 'project':
        return this.prisma.project.count({ where });
      case 'task':
        return this.prisma.task.count({ where });
      case 'case':
        return this.prisma.customerCase.count({ where });
      case 'activity':
        return this.prisma.scheduledActivity.count({ where });
      case 'savedView':
        return this.prisma.savedView.count({ where });
      case 'customFieldDefinition':
        return this.prisma.customFieldDefinition.count({ where });
      case 'tag':
        return this.prisma.tag.count({ where });
      case 'automationRule':
        return this.prisma.automationRule.count({ where });
      case 'notification':
        return this.prisma.notification.count({ where });
    }
  }
}
