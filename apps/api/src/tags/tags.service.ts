import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import { PERMISSIONS } from '../auth/auth.constants';
import { AuditService } from '../audit/audit.service';
import { Prisma, type PrismaClient } from '../generated/prisma/client';
import type { ConfigurableEntityType } from '../generated/prisma/enums';
import { PrismaService } from '../database/prisma.service';

type DbClient = Prisma.TransactionClient | PrismaService | PrismaClient;

@Injectable()
export class TagsService {
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  list(principal: AuthenticatedPrincipal) {
    return this.prisma.tag.findMany({
      where: { organizationId: principal.organizationId },
      orderBy: { name: 'asc' },
    });
  }

  async create(principal: AuthenticatedPrincipal, name: string) {
    const normalizedName = this.normalize(name);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const tag = await tx.tag.create({
          data: { name: name.trim(), normalizedName, organizationId: principal.organizationId },
        });
        await this.audit.create(
          {
            action: 'TAG_CREATED',
            actorId: principal.userId,
            entityId: tag.id,
            entityType: 'TAG',
            organizationId: principal.organizationId,
          },
          tx,
        );
        return tag;
      });
    } catch (cause) {
      if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2002')
        throw new ConflictException('A tag with this name already exists');
      throw cause;
    }
  }

  async update(principal: AuthenticatedPrincipal, id: string, name: string) {
    await this.requireTag(principal.organizationId, id);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const tag = await tx.tag.update({
          where: { id },
          data: { name: name.trim(), normalizedName: this.normalize(name) },
        });
        await this.audit.create(
          {
            action: 'TAG_UPDATED',
            actorId: principal.userId,
            entityId: id,
            entityType: 'TAG',
            organizationId: principal.organizationId,
          },
          tx,
        );
        return tag;
      });
    } catch (cause) {
      if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2002')
        throw new ConflictException('A tag with this name already exists');
      throw cause;
    }
  }

  async remove(principal: AuthenticatedPrincipal, id: string) {
    await this.requireTag(principal.organizationId, id);
    await this.prisma.$transaction(async (tx) => {
      await this.audit.create(
        {
          action: 'TAG_DELETED',
          actorId: principal.userId,
          entityId: id,
          entityType: 'TAG',
          organizationId: principal.organizationId,
        },
        tx,
      );
      await tx.tag.delete({ where: { id } });
    });
  }

  async attach(
    principal: AuthenticatedPrincipal,
    tagId: string,
    entityType: ConfigurableEntityType,
    entityId: string,
  ) {
    this.requireRecordUpdate(principal, entityType);
    await Promise.all([
      this.requireTag(principal.organizationId, tagId),
      this.requireEntity(principal.organizationId, entityType, entityId),
    ]);
    return this.prisma.entityTag.upsert({
      where: { tagId_entityType_entityId: { tagId, entityType, entityId } },
      create: { organizationId: principal.organizationId, tagId, entityType, entityId },
      update: {},
      include: { tag: true },
    });
  }

  async detach(
    principal: AuthenticatedPrincipal,
    tagId: string,
    entityType: ConfigurableEntityType,
    entityId: string,
  ) {
    this.requireRecordUpdate(principal, entityType);
    const assignment = await this.prisma.entityTag.findFirst({
      where: { organizationId: principal.organizationId, tagId, entityType, entityId },
    });
    if (!assignment) throw new NotFoundException('Tag assignment not found');
    await this.prisma.entityTag.delete({
      where: { tagId_entityType_entityId: { tagId, entityType, entityId } },
    });
  }

  async sync(
    client: DbClient,
    organizationId: string,
    entityType: ConfigurableEntityType,
    entityId: string,
    tagIds?: string[],
  ) {
    if (tagIds === undefined) return;
    const unique = [...new Set(tagIds)];
    const count = await client.tag.count({ where: { organizationId, id: { in: unique } } });
    if (count !== unique.length) throw new BadRequestException('One or more tags are invalid');
    await client.entityTag.deleteMany({
      where: { organizationId, entityType, entityId, tagId: { notIn: unique } },
    });
    if (unique.length)
      await client.entityTag.createMany({
        data: unique.map((tagId) => ({ organizationId, tagId, entityType, entityId })),
        skipDuplicates: true,
      });
  }

  async tagsForEntity(
    organizationId: string,
    entityType: ConfigurableEntityType,
    entityId: string,
  ) {
    const rows = await this.prisma.entityTag.findMany({
      where: { organizationId, entityType, entityId },
      include: { tag: true },
      orderBy: { tag: { name: 'asc' } },
    });
    return rows.map(({ tag }) => tag);
  }

  async decorate<T extends { id: string }>(
    organizationId: string,
    entityType: ConfigurableEntityType,
    records: T[],
  ) {
    if (!records.length) return records.map((record) => ({ ...record, tags: [] }));
    const rows = await this.prisma.entityTag.findMany({
      where: { organizationId, entityType, entityId: { in: records.map(({ id }) => id) } },
      include: { tag: true },
    });
    return records.map((record) => ({
      ...record,
      tags: rows
        .filter((row) => row.entityId === record.id)
        .map(({ tag }) => tag)
        .sort((a, b) => a.name.localeCompare(b.name)),
    }));
  }

  async matchingEntityIds(
    organizationId: string,
    entityType: ConfigurableEntityType,
    tagId?: string,
  ) {
    if (!tagId) return undefined;
    await this.requireTag(organizationId, tagId);
    const rows = await this.prisma.entityTag.findMany({
      where: { organizationId, entityType, tagId },
      select: { entityId: true },
    });
    return rows.map(({ entityId }) => entityId);
  }

  private normalize(name: string) {
    return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
  }
  private requireRecordUpdate(
    principal: AuthenticatedPrincipal,
    entityType: ConfigurableEntityType,
  ) {
    const required = {
      LEAD: PERMISSIONS.leadUpdate,
      COMPANY: PERMISSIONS.companyUpdate,
      CONTACT: PERMISSIONS.contactUpdate,
      PROJECT: PERMISSIONS.projectUpdate,
    }[entityType];
    if (!principal.permissions.includes(required))
      throw new ForbiddenException('Insufficient permission to update this record');
  }
  private async requireTag(organizationId: string, id: string) {
    const tag = await this.prisma.tag.findFirst({ where: { id, organizationId } });
    if (!tag) throw new NotFoundException('Tag not found');
    return tag;
  }
  private async requireEntity(
    organizationId: string,
    entityType: ConfigurableEntityType,
    entityId: string,
  ) {
    const where = { id: entityId, organizationId, archivedAt: null };
    const entity =
      entityType === 'LEAD'
        ? await this.prisma.lead.findFirst({ where, select: { id: true } })
        : entityType === 'COMPANY'
          ? await this.prisma.company.findFirst({ where, select: { id: true } })
          : entityType === 'CONTACT'
            ? await this.prisma.contact.findFirst({ where, select: { id: true } })
            : await this.prisma.project.findFirst({ where, select: { id: true } });
    if (!entity) throw new NotFoundException('Record not found');
  }
}
