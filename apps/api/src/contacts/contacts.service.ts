import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import { normalizeListQuery, paginationMeta } from '../common/dto/list-query.dto';
import { PrismaService } from '../database/prisma.service';
import type { ContactListQueryDto, CreateContactDto, UpdateContactDto } from './dto/contacts.dto';

const contactInclude = {
  company: { select: { id: true, name: true, status: true } },
} as const;

@Injectable()
export class ContactsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(principal: AuthenticatedPrincipal, query: ContactListQueryDto) {
    const listQuery = normalizeListQuery(query, 'createdAt', [
      'firstName',
      'lastName',
      'createdAt',
      'updatedAt',
    ]);
    const where: Prisma.ContactWhereInput = {
      organizationId: principal.organizationId,
      archivedAt: null,
      ...(query.company ? { companyId: query.company } : {}),
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
    return { data, meta: paginationMeta(listQuery.page, listQuery.limit, total) };
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
    return contact;
  }

  async create(principal: AuthenticatedPrincipal, dto: CreateContactDto) {
    await this.validateCompany(principal.organizationId, dto.companyId);
    const normalizedEmail = dto.email?.trim().toLowerCase();
    const contact = await this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary && dto.companyId)
        await tx.contact.updateMany({
          where: { companyId: dto.companyId, organizationId: principal.organizationId },
          data: { isPrimary: false },
        });
      const created = await tx.contact.create({
        data: {
          ...dto,
          normalizedEmail,
          createdById: principal.userId,
          organizationId: principal.organizationId,
        },
        include: contactInclude,
      });
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
    return contact;
  }

  async update(principal: AuthenticatedPrincipal, id: string, dto: UpdateContactDto) {
    const existing = await this.get(principal, id);
    await this.validateCompany(principal.organizationId, dto.companyId);
    return this.prisma.$transaction(async (tx) => {
      const targetCompanyId = dto.companyId !== undefined ? dto.companyId : existing.company?.id;
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
          ...dto,
          ...(dto.companyId === null ? { isPrimary: false } : {}),
          ...(dto.email !== undefined ? { normalizedEmail: dto.email.trim().toLowerCase() } : {}),
        },
        include: contactInclude,
      });
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
  }

  async archive(principal: AuthenticatedPrincipal, id: string) {
    await this.get(principal, id);
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
}
