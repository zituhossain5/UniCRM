import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { isUUID } from 'class-validator';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import { normalizeListQuery, paginationMeta } from '../common/dto/list-query.dto';
import { PrismaService } from '../database/prisma.service';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { TagsService } from '../tags/tags.service';
import type { ContactListQueryDto, CreateContactDto, UpdateContactDto } from './dto/contacts.dto';

const contactInclude = {
  company: { select: { id: true, name: true, status: true } },
} as const;

function intersectIds(first?: string[], second?: string[]) {
  if (!first) return second;
  if (!second) return first;
  const set = new Set(second);
  return first.filter((id) => set.has(id));
}

@Injectable()
export class ContactsService {
  constructor(
    @Inject(CustomFieldsService) private readonly customFields: CustomFieldsService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TagsService) private readonly tags: TagsService,
  ) {}

  async list(principal: AuthenticatedPrincipal, query: ContactListQueryDto) {
    if (query.company && !isUUID(query.company))
      throw new BadRequestException('company must be a UUID');
    const listQuery = normalizeListQuery(query, 'createdAt', [
      'firstName',
      'lastName',
      'createdAt',
      'updatedAt',
    ]);
    const recordIds = intersectIds(
      await this.tags.matchingEntityIds(principal.organizationId, 'CONTACT', query.tag),
      await this.customFields.matchingEntityIds(
        principal.organizationId,
        'CONTACT',
        query.customFields,
      ),
    );
    const where: Prisma.ContactWhereInput = {
      organizationId: principal.organizationId,
      archivedAt: null,
      ...(query.company ? { companyId: query.company } : {}),
      ...(recordIds ? { id: { in: recordIds } } : {}),
      ...(listQuery.search
        ? {
            OR: [
              { firstName: { contains: listQuery.search, mode: 'insensitive' } },
              { lastName: { contains: listQuery.search, mode: 'insensitive' } },
              { email: { contains: listQuery.search, mode: 'insensitive' } },
              { phone: { contains: listQuery.search, mode: 'insensitive' } },
              { company: { name: { contains: listQuery.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.contact.findMany({
        where,
        include: contactInclude,
        orderBy: { [listQuery.sort]: listQuery.order },
        skip: (listQuery.page - 1) * listQuery.limit,
        take: listQuery.limit,
      }),
      this.prisma.contact.count({ where }),
    ]);
    return {
      data: await this.decorate(principal.organizationId, data),
      meta: paginationMeta(listQuery.page, listQuery.limit, total),
    };
  }

  async get(principal: AuthenticatedPrincipal, id: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id, organizationId: principal.organizationId },
      include: {
        ...contactInclude,
        leads: {
          where: { archivedAt: null },
          select: { id: true, title: true, stage: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!contact) throw new NotFoundException('Contact not found');
    return (await this.decorate(principal.organizationId, [contact]))[0];
  }

  async create(principal: AuthenticatedPrincipal, dto: CreateContactDto) {
    this.customFields.rejectGeneratedControlKeys(dto);
    await this.validateCompany(principal.organizationId, dto.companyId);
    const normalizedEmail = dto.email?.trim().toLowerCase();
    const { customFields, tagIds, ...contactInput } = dto;
    const contact = await this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary && dto.companyId)
        await tx.contact.updateMany({
          where: { companyId: dto.companyId, organizationId: principal.organizationId },
          data: { isPrimary: false },
        });
      const created = await tx.contact.create({
        data: {
          ...contactInput,
          normalizedEmail,
          createdById: principal.userId,
          organizationId: principal.organizationId,
        },
        include: contactInclude,
      });
      await this.customFields.saveValues(
        tx,
        principal.organizationId,
        'CONTACT',
        created.id,
        customFields,
        true,
      );
      await this.tags.sync(tx, principal.organizationId, 'CONTACT', created.id, tagIds);
      await tx.activityLog.create({
        data: {
          action: 'CONTACT_CREATED',
          actorId: principal.userId,
          entityId: created.id,
          entityType: 'CONTACT',
          organizationId: principal.organizationId,
        },
      });
      return created;
    });
    return (await this.decorate(principal.organizationId, [contact]))[0];
  }

  async update(principal: AuthenticatedPrincipal, id: string, dto: UpdateContactDto) {
    this.customFields.rejectGeneratedControlKeys(dto);
    const existing = await this.requireActive(principal.organizationId, id);
    await this.validateCompany(principal.organizationId, dto.companyId);
    const { customFields, tagIds, ...contactInput } = dto;
    const contact = await this.prisma.$transaction(async (tx) => {
      const targetCompanyId = dto.companyId !== undefined ? dto.companyId : existing.companyId;
      const willBePrimary = dto.isPrimary ?? existing.isPrimary;
      if (willBePrimary && targetCompanyId)
        await tx.contact.updateMany({
          where: {
            companyId: targetCompanyId,
            organizationId: principal.organizationId,
            id: { not: id },
          },
          data: { isPrimary: false },
        });
      const updated = await tx.contact.update({
        where: { id },
        data: {
          ...contactInput,
          ...(dto.companyId === null ? { isPrimary: false } : {}),
          ...(dto.email !== undefined ? { normalizedEmail: dto.email.trim().toLowerCase() } : {}),
        },
        include: contactInclude,
      });
      await this.customFields.saveValues(
        tx,
        principal.organizationId,
        'CONTACT',
        id,
        customFields,
        false,
      );
      await this.tags.sync(tx, principal.organizationId, 'CONTACT', id, tagIds);
      await tx.activityLog.create({
        data: {
          action: 'CONTACT_UPDATED',
          actorId: principal.userId,
          entityId: id,
          entityType: 'CONTACT',
          organizationId: principal.organizationId,
        },
      });
      return updated;
    });
    return (await this.decorate(principal.organizationId, [contact]))[0];
  }

  async archive(principal: AuthenticatedPrincipal, id: string) {
    await this.requireActive(principal.organizationId, id);
    return this.prisma.$transaction(async (tx) => {
      const contact = await tx.contact.update({
        where: { id },
        data: { archivedAt: new Date(), isPrimary: false },
        include: contactInclude,
      });
      await tx.activityLog.create({
        data: {
          action: 'CONTACT_ARCHIVED',
          actorId: principal.userId,
          entityId: id,
          entityType: 'CONTACT',
          organizationId: principal.organizationId,
        },
      });
      return contact;
    });
  }

  private async validateCompany(organizationId: string, companyId?: string | null) {
    if (!companyId) return;
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, organizationId, archivedAt: null },
    });
    if (!company) throw new BadRequestException('Company is invalid or unavailable');
  }

  private async decorate<T extends { id: string }>(organizationId: string, records: T[]) {
    return this.tags.decorate(
      organizationId,
      'CONTACT',
      await this.customFields.decorate(organizationId, 'CONTACT', records),
    );
  }

  private async requireActive(organizationId: string, id: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id, organizationId },
      select: { archivedAt: true, companyId: true, isPrimary: true },
    });
    if (!contact) throw new NotFoundException('Contact not found');
    if (contact.archivedAt) throw new ConflictException('Archived contacts cannot be modified');
    return contact;
  }
}
