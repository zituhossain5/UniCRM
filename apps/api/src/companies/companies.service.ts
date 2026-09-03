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

@Injectable()
export class CompaniesService {
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
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
    const where: Prisma.CompanyWhereInput = {
      organizationId: principal.organizationId,
      archivedAt: query.status === 'ARCHIVED' ? { not: null } : null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.owner ? { accountOwnerId: query.owner } : {}),
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
    return { data, meta: paginationMeta(listQuery.page, listQuery.limit, total) };
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
    return { ...company, activity, projects, quotations, payments };
  }

  async create(principal: AuthenticatedPrincipal, dto: CreateCompanyDto) {
    if (dto.status === 'ARCHIVED')
      throw new BadRequestException('New companies cannot be archived');
    await this.validateOwner(principal.organizationId, dto.accountOwnerId);
    return this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: { ...dto, createdById: principal.userId, organizationId: principal.organizationId },
        include: companyInclude,
      });
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
  }

  async update(principal: AuthenticatedPrincipal, id: string, dto: UpdateCompanyDto) {
    await this.requireActive(principal.organizationId, id);
    if (dto.status === 'ARCHIVED')
      throw new BadRequestException('Use the archive endpoint to archive companies');
    await this.validateOwner(principal.organizationId, dto.accountOwnerId);
    return this.prisma.$transaction(async (tx) => {
      const company = await tx.company.update({
        where: { id },
        data: dto,
        include: companyInclude,
      });
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

  private async requireActive(organizationId: string, id: string) {
    const company = await this.prisma.company.findFirst({
      where: { id, organizationId },
      select: { archivedAt: true },
    });
    if (!company) throw new NotFoundException('Company not found');
    if (company.archivedAt) throw new ConflictException('Archived companies cannot be modified');
  }
}
