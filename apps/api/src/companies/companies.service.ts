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
import { PERMISSIONS } from '../auth/auth.constants';
import { AuditService } from '../audit/audit.service';
import { normalizeListQuery, paginationMeta } from '../common/dto/list-query.dto';
import { PrismaService } from '../database/prisma.service';
import { CompanyStatus } from '../generated/prisma/enums';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { TagsService } from '../tags/tags.service';
import { IntegrationsService } from '../integrations/integrations.service';
import type { CompanyListQueryDto, CreateCompanyDto, UpdateCompanyDto } from './dto/companies.dto';

const companyListInclude = {
  accountOwner: { select: { id: true, firstName: true, lastName: true } },
  contacts: {
    where: { archivedAt: null },
    orderBy: [{ isPrimary: 'desc' }, { firstName: 'asc' }],
    take: 1,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      jobTitle: true,
      email: true,
      phone: true,
      isPrimary: true,
    },
  },
  _count: {
    select: {
      leads: { where: { archivedAt: null, stage: { isWon: false, isLost: false } } },
    },
  },
} satisfies Prisma.CompanyInclude;

const companyInclude = {
  ...companyListInclude,
  contacts: { ...companyListInclude.contacts, take: undefined },
} satisfies Prisma.CompanyInclude;

const companyProjectSelect = {
  id: true,
  name: true,
  status: true,
  priority: true,
  progress: true,
  deadline: true,
} as const;

function intersectIds(first?: string[], second?: string[]) {
  if (!first) return second;
  if (!second) return first;
  const set = new Set(second);
  return first.filter((id) => set.has(id));
}

@Injectable()
export class CompaniesService {
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(CustomFieldsService) private readonly customFields: CustomFieldsService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TagsService) private readonly tags: TagsService,
    @Inject(IntegrationsService) private readonly integrations: IntegrationsService,
  ) {}

  async list(principal: AuthenticatedPrincipal, query: CompanyListQueryDto) {
    if (query.status && !Object.values(CompanyStatus).includes(query.status))
      throw new BadRequestException('Unsupported company status');
    if (query.owner && !isUUID(query.owner)) throw new BadRequestException('owner must be a UUID');
    const listQuery = normalizeListQuery(query, 'createdAt', [
      'name',
      'createdAt',
      'updatedAt',
      'status',
    ]);
    const recordIds = intersectIds(
      await this.tags.matchingEntityIds(principal.organizationId, 'COMPANY', query.tag),
      await this.customFields.matchingEntityIds(
        principal.organizationId,
        'COMPANY',
        query.customFields,
      ),
    );
    const where: Prisma.CompanyWhereInput = {
      organizationId: principal.organizationId,
      archivedAt: query.status === 'ARCHIVED' ? { not: null } : null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.owner ? { accountOwnerId: query.owner } : {}),
      ...(recordIds ? { id: { in: recordIds } } : {}),
      ...(listQuery.search
        ? {
            OR: ['name', 'email', 'phone', 'website'].map((field) => ({
              [field]: { contains: listQuery.search, mode: 'insensitive' },
            })),
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.company.findMany({
        where,
        include: companyListInclude,
        orderBy: { [listQuery.sort]: listQuery.order },
        skip: (listQuery.page - 1) * listQuery.limit,
        take: listQuery.limit,
      }),
      this.prisma.company.count({ where }),
    ]);
    return {
      data: await this.decorate(principal.organizationId, data),
      meta: paginationMeta(listQuery.page, listQuery.limit, total),
    };
  }

  async get(principal: AuthenticatedPrincipal, id: string) {
    const company = await this.prisma.company.findFirst({
      where: { id, organizationId: principal.organizationId },
      include: companyInclude,
    });
    if (!company) throw new NotFoundException('Company not found');
    const [activity, projects, quotations, payments] = await Promise.all([
      this.prisma.activityLog.findMany({
        where: { organizationId: principal.organizationId, entityType: 'COMPANY', entityId: id },
        include: { actor: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 25,
      }),
      principal.permissions.includes(PERMISSIONS.projectRead)
        ? this.prisma.project.findMany({
            where: { organizationId: principal.organizationId, companyId: id, archivedAt: null },
            orderBy: { createdAt: 'desc' },
            select: companyProjectSelect,
          })
        : Promise.resolve([]),
      principal.permissions.includes(PERMISSIONS.quotationRead)
        ? this.prisma.quotation.findMany({
            where: { organizationId: principal.organizationId, companyId: id, archivedAt: null },
            select: {
              id: true,
              quotationNumber: true,
              status: true,
              total: true,
              currency: true,
              issueDate: true,
            },
            orderBy: { createdAt: 'desc' },
          })
        : Promise.resolve([]),
      principal.permissions.includes(PERMISSIONS.paymentRead)
        ? this.prisma.payment.findMany({
            where: { organizationId: principal.organizationId, companyId: id, archivedAt: null },
            select: {
              id: true,
              amount: true,
              currency: true,
              paymentDate: true,
              method: true,
              reference: true,
            },
            orderBy: { paymentDate: 'desc' },
          })
        : Promise.resolve([]),
    ]);
    return (
      await this.decorate(principal.organizationId, [
        { ...company, activity, projects, quotations, payments },
      ])
    )[0];
  }

  async create(principal: AuthenticatedPrincipal, dto: CreateCompanyDto) {
    this.customFields.rejectGeneratedControlKeys(dto);
    if (dto.status === 'ARCHIVED')
      throw new BadRequestException('New companies cannot be archived');
    await this.validateOwner(principal.organizationId, dto.accountOwnerId);
    const { customFields, tagIds, ...companyInput } = dto;
    const company = await this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          ...companyInput,
          createdById: principal.userId,
          organizationId: principal.organizationId,
        },
        include: companyInclude,
      });
      await this.customFields.saveValues(
        tx,
        principal.organizationId,
        'COMPANY',
        company.id,
        customFields,
        true,
      );
      await this.tags.sync(tx, principal.organizationId, 'COMPANY', company.id, tagIds);
      await this.audit.create(
        {
          action: 'COMPANY_CREATED',
          actorId: principal.userId,
          entityId: company.id,
          entityType: 'COMPANY',
          organizationId: principal.organizationId,
        },
        tx,
      );
      return company;
    });
    await this.integrations.publishBusinessEvent(
      principal.organizationId,
      'company.created',
      company.id,
      {
        name: company.name,
        status: company.status,
        accountOwnerId: company.accountOwnerId,
      },
    );
    return (await this.decorate(principal.organizationId, [company]))[0];
  }

  async update(principal: AuthenticatedPrincipal, id: string, dto: UpdateCompanyDto) {
    this.customFields.rejectGeneratedControlKeys(dto);
    await this.requireActive(principal.organizationId, id);
    if (dto.status === 'ARCHIVED')
      throw new BadRequestException('Use the archive endpoint to archive companies');
    await this.validateOwner(principal.organizationId, dto.accountOwnerId);
    const { customFields, tagIds, ...companyInput } = dto;
    const company = await this.prisma.$transaction(async (tx) => {
      const company = await tx.company.update({
        where: { id },
        data: companyInput,
        include: companyInclude,
      });
      await this.customFields.saveValues(
        tx,
        principal.organizationId,
        'COMPANY',
        id,
        customFields,
        false,
      );
      await this.tags.sync(tx, principal.organizationId, 'COMPANY', id, tagIds);
      await this.audit.create(
        {
          action: 'COMPANY_UPDATED',
          actorId: principal.userId,
          entityId: id,
          entityType: 'COMPANY',
          organizationId: principal.organizationId,
        },
        tx,
      );
      return company;
    });
    await this.integrations.publishBusinessEvent(
      principal.organizationId,
      'company.updated',
      company.id,
      {
        name: company.name,
        status: company.status,
        accountOwnerId: company.accountOwnerId,
      },
    );
    return (await this.decorate(principal.organizationId, [company]))[0];
  }

  async archive(principal: AuthenticatedPrincipal, id: string) {
    await this.requireActive(principal.organizationId, id);
    return this.prisma.$transaction(async (tx) => {
      const company = await tx.company.update({
        where: { id },
        data: { archivedAt: new Date(), status: 'ARCHIVED' },
        include: companyInclude,
      });
      await this.audit.create(
        {
          action: 'COMPANY_ARCHIVED',
          actorId: principal.userId,
          entityId: id,
          entityType: 'COMPANY',
          organizationId: principal.organizationId,
        },
        tx,
      );
      return company;
    });
  }

  private async validateOwner(organizationId: string, ownerId?: string | null) {
    if (!ownerId) return;
    const owner = await this.prisma.user.findFirst({
      where: { id: ownerId, organizationId, status: 'ACTIVE' },
    });
    if (!owner) throw new NotFoundException('Account owner not found');
  }

  private async decorate<T extends { id: string }>(organizationId: string, records: T[]) {
    return this.tags.decorate(
      organizationId,
      'COMPANY',
      await this.customFields.decorate(organizationId, 'COMPANY', records),
    );
  }

  private async requireActive(organizationId: string, id: string) {
    const company = await this.prisma.company.findFirst({
      where: { id, organizationId },
      select: { archivedAt: true },
    });
    if (!company) throw new NotFoundException('Company not found');
    if (company.archivedAt) throw new ConflictException('Archived companies cannot be modified');
  }
}
