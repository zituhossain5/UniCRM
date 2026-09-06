import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { Prisma } from '../generated/prisma/client';
import type { SavedViewEntityType, SavedViewVisibility } from '../generated/prisma/enums';
import { PrismaService } from '../database/prisma.service';
import type { CreateSavedViewDto, UpdateSavedViewDto } from './dto/saved-views.dto';

const FILTERS: Record<SavedViewEntityType, ReadonlySet<string>> = {
  LEAD: new Set([
    'search',
    'stage',
    'pipeline',
    'owner',
    'company',
    'priority',
    'source',
    'view',
    'tag',
    'customFields',
  ]),
  COMPANY: new Set(['search', 'status', 'owner', 'tag', 'customFields']),
  CONTACT: new Set(['search', 'company', 'tag', 'customFields']),
  PROJECT: new Set([
    'search',
    'status',
    'priority',
    'manager',
    'company',
    'deadline',
    'view',
    'tag',
    'customFields',
  ]),
  TASK: new Set(['search', 'project', 'assignee', 'status', 'priority', 'dueDate', 'view']),
};
const SORTS: Record<SavedViewEntityType, ReadonlySet<string>> = {
  LEAD: new Set([
    'title',
    'createdAt',
    'updatedAt',
    'estimatedValue',
    'nextFollowUpAt',
    'lastActivityAt',
  ]),
  COMPANY: new Set(['name', 'createdAt', 'updatedAt', 'status']),
  CONTACT: new Set(['firstName', 'lastName', 'createdAt', 'updatedAt']),
  PROJECT: new Set([
    'name',
    'createdAt',
    'updatedAt',
    'deadline',
    'status',
    'priority',
    'progress',
  ]),
  TASK: new Set(['title', 'createdAt', 'updatedAt', 'dueDate', 'status', 'priority']),
};
const COLUMNS: Record<SavedViewEntityType, ReadonlySet<string>> = {
  LEAD: new Set([
    'title',
    'company',
    'stage',
    'value',
    'owner',
    'priority',
    'nextFollowUpAt',
    'tags',
  ]),
  COMPANY: new Set(['name', 'primaryContact', 'status', 'owner', 'openLeads', 'updatedAt', 'tags']),
  CONTACT: new Set(['name', 'company', 'jobTitle', 'email', 'phone', 'tags']),
  PROJECT: new Set([
    'name',
    'company',
    'status',
    'priority',
    'manager',
    'deadline',
    'progress',
    'tags',
  ]),
  TASK: new Set(['title', 'project', 'status', 'priority', 'assignee', 'dueDate']),
};

@Injectable()
export class SavedViewsService {
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  list(principal: AuthenticatedPrincipal, entityType: SavedViewEntityType) {
    return this.prisma.savedView.findMany({
      where: {
        organizationId: principal.organizationId,
        entityType,
        OR: [{ visibility: 'ORGANIZATION' }, { visibility: 'PRIVATE', userId: principal.userId }],
      },
      orderBy: [{ isDefault: 'desc' }, { visibility: 'asc' }, { name: 'asc' }],
    });
  }

  async create(principal: AuthenticatedPrincipal, dto: CreateSavedViewDto) {
    const data = this.validateDefinition(dto.entityType, dto.filters, dto.sort, dto.columns);
    this.validateDefault(dto.visibility, dto.isDefault);
    await this.ensureUniqueName(principal, dto.entityType, dto.name, dto.visibility);
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault)
        await tx.savedView.updateMany({
          where: {
            organizationId: principal.organizationId,
            userId: principal.userId,
            entityType: dto.entityType,
            isDefault: true,
          },
          data: { isDefault: false },
        });
      const view = await tx.savedView.create({
        data: {
          ...data,
          entityType: dto.entityType,
          name: dto.name,
          visibility: dto.visibility,
          isDefault: dto.isDefault ?? false,
          organizationId: principal.organizationId,
          userId: dto.visibility === 'PRIVATE' ? principal.userId : null,
        },
      });
      await this.audit.create(
        {
          action: 'SAVED_VIEW_CREATED',
          actorId: principal.userId,
          entityId: view.id,
          entityType: 'SAVED_VIEW',
          organizationId: principal.organizationId,
          metadata: { entityType: dto.entityType, visibility: dto.visibility },
        },
        tx,
      );
      return view;
    });
  }

  async update(principal: AuthenticatedPrincipal, id: string, dto: UpdateSavedViewDto) {
    const existing = await this.requireMutable(principal, id);
    const visibility = dto.visibility ?? existing.visibility;
    const isDefault = dto.isDefault ?? existing.isDefault;
    this.validateDefault(visibility, isDefault);
    const data = this.validateDefinition(
      existing.entityType,
      dto.filters ?? existing.filters,
      dto.sort === undefined ? existing.sort : dto.sort,
      dto.columns === undefined ? existing.columns : dto.columns,
    );
    if (dto.name || dto.visibility)
      await this.ensureUniqueName(
        principal,
        existing.entityType,
        dto.name ?? existing.name,
        visibility,
        id,
      );
    return this.prisma.$transaction(async (tx) => {
      if (isDefault)
        await tx.savedView.updateMany({
          where: {
            organizationId: principal.organizationId,
            userId: principal.userId,
            entityType: existing.entityType,
            isDefault: true,
            id: { not: id },
          },
          data: { isDefault: false },
        });
      const view = await tx.savedView.update({
        where: { id },
        data: {
          ...data,
          ...(dto.name ? { name: dto.name } : {}),
          visibility,
          isDefault,
          userId: visibility === 'PRIVATE' ? principal.userId : null,
        },
      });
      await this.audit.create(
        {
          action: 'SAVED_VIEW_UPDATED',
          actorId: principal.userId,
          entityId: id,
          entityType: 'SAVED_VIEW',
          organizationId: principal.organizationId,
        },
        tx,
      );
      return view;
    });
  }

  async remove(principal: AuthenticatedPrincipal, id: string) {
    await this.requireMutable(principal, id);
    await this.prisma.$transaction(async (tx) => {
      await this.audit.create(
        {
          action: 'SAVED_VIEW_DELETED',
          actorId: principal.userId,
          entityId: id,
          entityType: 'SAVED_VIEW',
          organizationId: principal.organizationId,
        },
        tx,
      );
      await tx.savedView.delete({ where: { id } });
    });
  }

  private validateDefinition(
    entityType: SavedViewEntityType,
    filters: unknown,
    sort: unknown,
    columns: unknown,
  ) {
    if (!filters || Array.isArray(filters) || typeof filters !== 'object')
      throw new BadRequestException('filters must be an object');
    const entries = Object.entries(filters as Record<string, unknown>);
    if (entries.length > 20 || entries.some(([key]) => !FILTERS[entityType].has(key)))
      throw new BadRequestException('Saved view contains unsupported filters');
    for (const [key, value] of entries) this.validateFilterValue(key, value);
    let safeSort: Prisma.InputJsonValue | typeof Prisma.JsonNull = Prisma.JsonNull;
    if (sort !== null && sort !== undefined) {
      if (Array.isArray(sort) || typeof sort !== 'object')
        throw new BadRequestException('sort must be an object');
      const candidate = sort as Record<string, unknown>;
      if (
        Object.keys(candidate).some((key) => !['field', 'order'].includes(key)) ||
        typeof candidate.field !== 'string' ||
        !SORTS[entityType].has(candidate.field) ||
        !['asc', 'desc'].includes(String(candidate.order))
      )
        throw new BadRequestException('Saved view contains an unsupported sort');
      safeSort = { field: candidate.field, order: candidate.order as string };
    }
    let safeColumns: Prisma.InputJsonValue | typeof Prisma.JsonNull = Prisma.JsonNull;
    if (columns !== null && columns !== undefined) {
      if (
        !Array.isArray(columns) ||
        columns.length > 20 ||
        columns.some((column) => typeof column !== 'string' || !COLUMNS[entityType].has(column)) ||
        new Set(columns).size !== columns.length
      )
        throw new BadRequestException('Saved view contains unsupported columns');
      safeColumns = columns as string[];
    }
    return { filters: filters as Prisma.InputJsonObject, sort: safeSort, columns: safeColumns };
  }

  private validateFilterValue(key: string, value: unknown) {
    if (key === 'customFields') {
      if (
        !value ||
        Array.isArray(value) ||
        typeof value !== 'object' ||
        Object.keys(value).length > 10
      )
        throw new BadRequestException('customFields filter must be an object');
      for (const [field, fieldValue] of Object.entries(value as Record<string, unknown>)) {
        if (!/^[a-z][a-z0-9_]{0,79}$/.test(field) || !this.isSafeValue(fieldValue))
          throw new BadRequestException('customFields filter is invalid');
      }
      return;
    }
    if (!this.isSafeValue(value))
      throw new BadRequestException(`Filter ${key} has an invalid value`);
    if (
      ['stage', 'pipeline', 'owner', 'company', 'tag', 'project', 'assignee'].includes(key) &&
      typeof value === 'string' &&
      !isUUID(value)
    )
      throw new BadRequestException(`Filter ${key} must be a UUID`);
  }
  private isSafeValue(value: unknown): value is Prisma.InputJsonValue {
    return (
      (typeof value === 'string' && value.length <= 500) ||
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value)) ||
      (Array.isArray(value) &&
        value.length <= 25 &&
        value.every((entry) => typeof entry === 'string' && entry.length <= 120))
    );
  }
  private validateDefault(visibility: SavedViewVisibility, isDefault?: boolean) {
    if (visibility === 'ORGANIZATION' && isDefault)
      throw new BadRequestException('Only private views may be a personal default');
  }
  private async ensureUniqueName(
    principal: AuthenticatedPrincipal,
    entityType: SavedViewEntityType,
    name: string,
    visibility: SavedViewVisibility,
    excludeId?: string,
  ) {
    const existing = await this.prisma.savedView.findFirst({
      where: {
        organizationId: principal.organizationId,
        entityType,
        visibility,
        name: { equals: name, mode: 'insensitive' },
        ...(visibility === 'PRIVATE' ? { userId: principal.userId } : { userId: null }),
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (existing) throw new ConflictException('A saved view with this name already exists');
  }
  private async requireMutable(principal: AuthenticatedPrincipal, id: string) {
    const view = await this.prisma.savedView.findFirst({
      where: {
        id,
        organizationId: principal.organizationId,
        OR: [{ visibility: 'ORGANIZATION' }, { visibility: 'PRIVATE', userId: principal.userId }],
      },
    });
    if (!view) throw new NotFoundException('Saved view not found');
    return view;
  }
}
