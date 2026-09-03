import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { normalizeListQuery, paginationMeta } from '../common/dto/list-query.dto';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { CreatePaymentDto, PaymentListQueryDto, UpdatePaymentDto } from './dto/payments.dto';

const include = {
  company: { select: { id: true, name: true } },
  project: { select: { id: true, name: true } },
  quotation: { select: { id: true, quotationNumber: true, total: true } },
  recordedBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.PaymentInclude;

const dateOnly = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00.000Z`);

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  async list(principal: AuthenticatedPrincipal, query: PaymentListQueryDto) {
    const list = normalizeListQuery(query, 'paymentDate', [
      'paymentDate',
      'amount',
      'createdAt',
      'updatedAt',
    ]);
    const where: Prisma.PaymentWhereInput = {
      organizationId: principal.organizationId,
      archivedAt: null,
      ...(query.company ? { companyId: query.company } : {}),
      ...(query.project ? { projectId: query.project } : {}),
      ...(query.quotation ? { quotationId: query.quotation } : {}),
      ...(query.method ? { method: query.method } : {}),
      ...(query.paymentDate ? { paymentDate: dateOnly(query.paymentDate) } : {}),
      ...(list.search
        ? {
            OR: [
              { reference: { contains: list.search, mode: 'insensitive' } },
              { company: { name: { contains: list.search, mode: 'insensitive' } } },
              { project: { is: { name: { contains: list.search, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        include,
        orderBy: { [list.sort]: list.order },
        skip: (list.page - 1) * list.limit,
        take: list.limit,
      }),
      this.prisma.payment.count({ where }),
    ]);
    return { data, meta: paginationMeta(list.page, list.limit, total) };
  }

  async get(principal: AuthenticatedPrincipal, id: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, organizationId: principal.organizationId },
      include,
    });
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  async referenceData(principal: AuthenticatedPrincipal) {
    const organizationId = principal.organizationId;
    const [companies, projects, quotations] = await this.prisma.$transaction([
      this.prisma.company.findMany({
        where: { organizationId, archivedAt: null },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.project.findMany({
        where: { organizationId, archivedAt: null },
        select: { id: true, companyId: true, name: true, currency: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.quotation.findMany({
        where: {
          organizationId,
          archivedAt: null,
          status: { in: ['SENT', 'ACCEPTED', 'EXPIRED'] },
        },
        select: {
          id: true,
          companyId: true,
          projectId: true,
          quotationNumber: true,
          currency: true,
          total: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return { companies, projects, quotations };
  }

  async create(principal: AuthenticatedPrincipal, dto: CreatePaymentDto) {
    this.validateAmount(dto.amount);
    await this.validateAssociations(
      principal.organizationId,
      dto.companyId,
      dto.currency,
      dto.projectId,
      dto.quotationId,
    );
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          ...dto,
          currency: dto.currency.toUpperCase(),
          paymentDate: dateOnly(dto.paymentDate),
          organizationId: principal.organizationId,
          recordedById: principal.userId,
        },
        include,
      });
      await this.audit.create(
        {
          action: 'PAYMENT_CREATED',
          actorId: principal.userId,
          entityId: payment.id,
          entityType: 'PAYMENT',
          organizationId: principal.organizationId,
          metadata: {
            companyId: payment.companyId,
            projectId: payment.projectId,
            quotationId: payment.quotationId,
            currency: payment.currency,
          },
        },
        tx,
      );
      await this.relatedActivity(
        tx,
        payment,
        principal.organizationId,
        principal.userId,
        'recorded',
      );
      const recipient = payment.projectId
        ? await tx.project.findFirst({
            where: { id: payment.projectId, organizationId: principal.organizationId },
            select: { projectManagerId: true },
          })
        : null;
      if (recipient?.projectManagerId && recipient.projectManagerId !== principal.userId) {
        await this.notifications.create(
          {
            organizationId: principal.organizationId,
            userId: recipient.projectManagerId,
            type: 'PAYMENT_RECORDED',
            title: 'Payment recorded',
            message: `${payment.currency} ${payment.amount.toFixed(2)}`,
            entityType: 'PAYMENT',
            entityId: payment.id,
            dedupeKey: `payment:${payment.id}:recorded`,
          },
          tx,
        );
      }
      return payment;
    });
  }

  async update(principal: AuthenticatedPrincipal, id: string, dto: UpdatePaymentDto) {
    const existing = await this.requireActive(principal.organizationId, id);
    const companyId = dto.companyId ?? existing.companyId;
    const projectId = dto.projectId === undefined ? existing.projectId : dto.projectId;
    const quotationId = dto.quotationId === undefined ? existing.quotationId : dto.quotationId;
    if (dto.amount) this.validateAmount(dto.amount);
    await this.validateAssociations(
      principal.organizationId,
      companyId,
      dto.currency ?? existing.currency,
      projectId,
      quotationId,
    );
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.update({
        where: { id },
        data: {
          ...dto,
          currency: dto.currency?.toUpperCase(),
          paymentDate: dto.paymentDate ? dateOnly(dto.paymentDate) : undefined,
        },
        include,
      });
      await this.audit.create(
        {
          action: 'PAYMENT_UPDATED',
          actorId: principal.userId,
          entityId: id,
          entityType: 'PAYMENT',
          organizationId: principal.organizationId,
          metadata: {
            companyId: payment.companyId,
            projectId: payment.projectId,
            quotationId: payment.quotationId,
          },
        },
        tx,
      );
      await this.relatedActivity(
        tx,
        payment,
        principal.organizationId,
        principal.userId,
        'updated',
      );
      return payment;
    });
  }

  async archive(principal: AuthenticatedPrincipal, id: string) {
    const existing = await this.requireActive(principal.organizationId, id);
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.update({
        where: { id },
        data: { archivedAt: new Date() },
        include,
      });
      await this.audit.create(
        {
          action: 'PAYMENT_ARCHIVED',
          actorId: principal.userId,
          entityId: id,
          entityType: 'PAYMENT',
          organizationId: principal.organizationId,
          metadata: {
            companyId: existing.companyId,
            projectId: existing.projectId,
            quotationId: existing.quotationId,
          },
        },
        tx,
      );
      await this.relatedActivity(
        tx,
        payment,
        principal.organizationId,
        principal.userId,
        'archived',
      );
      return payment;
    });
  }

  private validateAmount(value: string) {
    if (new Prisma.Decimal(value).lessThanOrEqualTo(0))
      throw new BadRequestException('Payment amount must be greater than zero');
  }

  private async validateAssociations(
    organizationId: string,
    companyId: string,
    currency: string,
    projectId?: string | null,
    quotationId?: string | null,
  ) {
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, organizationId, archivedAt: null },
      select: { id: true },
    });
    if (!company) throw new NotFoundException('Company not found');
    if (projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: projectId, organizationId, archivedAt: null },
        select: { companyId: true, currency: true },
      });
      if (!project) throw new NotFoundException('Project not found');
      if (project.companyId !== companyId)
        throw new BadRequestException('Project must belong to the selected company');
      if (project.currency !== currency.toUpperCase())
        throw new BadRequestException('Payment currency must match the project currency');
    }
    if (quotationId) {
      const quotation = await this.prisma.quotation.findFirst({
        where: { id: quotationId, organizationId, archivedAt: null },
        select: { companyId: true, projectId: true, currency: true },
      });
      if (!quotation) throw new NotFoundException('Quotation not found');
      if (quotation.companyId !== companyId)
        throw new BadRequestException('Quotation must belong to the selected company');
      if (quotation.currency !== currency.toUpperCase())
        throw new BadRequestException('Payment currency must match the quotation currency');
      if (projectId && quotation.projectId && quotation.projectId !== projectId)
        throw new BadRequestException('Quotation belongs to a different project');
    }
  }

  private async requireActive(organizationId: string, id: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, organizationId },
      select: {
        id: true,
        companyId: true,
        projectId: true,
        quotationId: true,
        currency: true,
        archivedAt: true,
      },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.archivedAt) throw new ConflictException('Archived payments cannot be modified');
    return payment;
  }

  private async relatedActivity(
    tx: Prisma.TransactionClient,
    payment: {
      id: string;
      amount: Prisma.Decimal;
      currency: string;
      companyId: string;
      projectId: string | null;
      quotationId: string | null;
    },
    organizationId: string,
    actorId: string,
    verb: string,
  ) {
    const targets = [
      { entityType: 'COMPANY', entityId: payment.companyId },
      ...(payment.projectId ? [{ entityType: 'PROJECT', entityId: payment.projectId }] : []),
      ...(payment.quotationId ? [{ entityType: 'QUOTATION', entityId: payment.quotationId }] : []),
    ];
    await tx.activityLog.createMany({
      data: targets.map((target) => ({
        organizationId,
        actorId,
        ...target,
        action: 'PAYMENT_ACTIVITY',
        metadata: {
          paymentId: payment.id,
          amount: payment.amount.toString(),
          currency: payment.currency,
          verb,
        },
      })),
    });
  }
}
