import { randomUUID } from 'node:crypto';
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
import { LocalStorageService } from '../attachments/local-storage.service';
import { normalizeListQuery, paginationMeta } from '../common/dto/list-query.dto';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import type {
  CreateQuotationDto,
  QuotationListQueryDto,
  UpdateQuotationDto,
} from './dto/quotations.dto';
import { QuotationPdfService } from './quotation-pdf.service';

const summaryInclude = {
  company: { select: { id: true, name: true } },
  contact: { select: { id: true, firstName: true, lastName: true } },
  lead: { select: { id: true, title: true } },
  project: { select: { id: true, name: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  _count: { select: { items: true } },
} satisfies Prisma.QuotationInclude;

const detailInclude = {
  ...summaryInclude,
  organization: { select: { name: true } },
  company: { select: { id: true, name: true, email: true, phone: true } },
  contact: { select: { id: true, firstName: true, lastName: true, email: true } },
  items: { orderBy: { position: 'asc' as const } },
  payments: { where: { archivedAt: null }, orderBy: { paymentDate: 'desc' as const } },
} satisfies Prisma.QuotationInclude;

const dateOnly = (value: string | null | undefined) =>
  value ? new Date(`${value.slice(0, 10)}T00:00:00.000Z`) : undefined;

function publicQuotation<T extends { pdfSnapshotKey: string | null }>(quotation: T) {
  const { pdfSnapshotKey, ...result } = quotation;
  void pdfSnapshotKey;
  return result;
}

@Injectable()
export class QuotationsService {
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(LocalStorageService) private readonly storage: LocalStorageService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(QuotationPdfService) private readonly pdf: QuotationPdfService,
  ) {}

  async list(principal: AuthenticatedPrincipal, query: QuotationListQueryDto) {
    await this.expireDue(principal.organizationId);
    const list = normalizeListQuery(query, 'createdAt', [
      'quotationNumber',
      'issueDate',
      'expiryDate',
      'total',
      'createdAt',
      'updatedAt',
    ]);
    const where: Prisma.QuotationWhereInput = {
      organizationId: principal.organizationId,
      archivedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.company ? { companyId: query.company } : {}),
      ...(query.lead ? { leadId: query.lead } : {}),
      ...(query.project ? { projectId: query.project } : {}),
      ...(query.createdBy ? { createdById: query.createdBy } : {}),
      ...(query.currency ? { currency: query.currency.toUpperCase() } : {}),
      ...(query.issueDate ? { issueDate: dateOnly(query.issueDate) } : {}),
      ...(query.expiryDate ? { expiryDate: dateOnly(query.expiryDate) } : {}),
      ...(list.search
        ? {
            OR: [
              { quotationNumber: { contains: list.search, mode: 'insensitive' } },
              { company: { name: { contains: list.search, mode: 'insensitive' } } },
              {
                contact: {
                  is: {
                    OR: [
                      { firstName: { contains: list.search, mode: 'insensitive' } },
                      { lastName: { contains: list.search, mode: 'insensitive' } },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.quotation.findMany({
        where,
        include: summaryInclude,
        orderBy: { [list.sort]: list.order },
        skip: (list.page - 1) * list.limit,
        take: list.limit,
      }),
      this.prisma.quotation.count({ where }),
    ]);
    return { data: data.map(publicQuotation), meta: paginationMeta(list.page, list.limit, total) };
  }

  async get(principal: AuthenticatedPrincipal, id: string) {
    await this.expireDue(principal.organizationId);
    const quotation = await this.prisma.quotation.findFirst({
      where: { id, organizationId: principal.organizationId },
      include: detailInclude,
    });
    if (!quotation) throw new NotFoundException('Quotation not found');
    const paid = quotation.payments.reduce(
      (sum, payment) => sum.plus(payment.amount),
      new Prisma.Decimal(0),
    );
    const activity = await this.prisma.activityLog.findMany({
      where: { organizationId: principal.organizationId, entityType: 'QUOTATION', entityId: id },
      include: { actor: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return {
      ...publicQuotation(quotation),
      paid: paid.toDecimalPlaces(2),
      remaining: quotation.total.minus(paid).toDecimalPlaces(2),
      activity,
    };
  }

  async referenceData(principal: AuthenticatedPrincipal) {
    const organizationId = principal.organizationId;
    const [companies, contacts, leads, projects, users] = await this.prisma.$transaction([
      this.prisma.company.findMany({
        where: { organizationId, archivedAt: null },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.contact.findMany({
        where: { organizationId, archivedAt: null },
        select: { id: true, companyId: true, firstName: true, lastName: true },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      }),
      this.prisma.lead.findMany({
        where: { organizationId, archivedAt: null, companyId: { not: null } },
        select: {
          id: true,
          companyId: true,
          contactId: true,
          title: true,
          estimatedValue: true,
          currency: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.project.findMany({
        where: { organizationId, archivedAt: null },
        select: { id: true, companyId: true, name: true, currency: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.user.findMany({
        where: { organizationId, status: 'ACTIVE' },
        select: { id: true, firstName: true, lastName: true },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      }),
    ]);
    return { companies, contacts, leads, projects, users };
  }

  async create(principal: AuthenticatedPrincipal, dto: CreateQuotationDto) {
    await this.validateAssociations(
      principal.organizationId,
      dto.companyId,
      dto.contactId,
      dto.leadId,
      dto.projectId,
    );
    this.validateDates(dto.issueDate, dto.expiryDate);
    const calculated = this.calculate(dto.items, dto.discountType, dto.discountValue, dto.taxRate);
    return this.prisma.$transaction(async (tx) => {
      const counter = await tx.quotationNumberCounter.upsert({
        where: { organizationId: principal.organizationId },
        create: { organizationId: principal.organizationId, nextNumber: 2 },
        update: { nextNumber: { increment: 1 } },
        select: { nextNumber: true },
      });
      const number = counter.nextNumber - 1;
      const quotation = await tx.quotation.create({
        data: {
          organizationId: principal.organizationId,
          quotationNumber: `QT-${number.toString().padStart(6, '0')}`,
          companyId: dto.companyId,
          contactId: dto.contactId,
          leadId: dto.leadId,
          projectId: dto.projectId,
          issueDate: dateOnly(dto.issueDate)!,
          expiryDate: dateOnly(dto.expiryDate),
          currency: dto.currency.toUpperCase(),
          discountType: dto.discountType,
          discountValue: dto.discountValue,
          taxRate: dto.taxRate,
          notes: dto.notes,
          terms: dto.terms,
          createdById: principal.userId,
          ...calculated,
          items: {
            create: calculated.items.map((item, position) => ({
              ...item,
              position,
              organizationId: principal.organizationId,
            })),
          },
        },
        include: detailInclude,
      });
      await this.audit.create(
        {
          action: 'QUOTATION_CREATED',
          actorId: principal.userId,
          entityId: quotation.id,
          entityType: 'QUOTATION',
          organizationId: principal.organizationId,
          metadata: { quotationNumber: quotation.quotationNumber, companyId: quotation.companyId },
        },
        tx,
      );
      await this.relatedActivity(
        tx,
        quotation,
        principal.organizationId,
        principal.userId,
        'created',
      );
      return publicQuotation(quotation);
    });
  }

  async update(principal: AuthenticatedPrincipal, id: string, dto: UpdateQuotationDto) {
    const existing = await this.requireDraft(principal.organizationId, id);
    const companyId = dto.companyId ?? existing.companyId;
    await this.validateAssociations(
      principal.organizationId,
      companyId,
      dto.contactId === undefined ? existing.contactId : dto.contactId,
      dto.leadId === undefined ? existing.leadId : dto.leadId,
      dto.projectId === undefined ? existing.projectId : dto.projectId,
    );
    this.validateDates(
      dto.issueDate ?? existing.issueDate.toISOString(),
      dto.expiryDate === undefined ? existing.expiryDate?.toISOString() : dto.expiryDate,
    );
    const items =
      dto.items ??
      existing.items.map((item) => ({
        description: item.description,
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(),
      }));
    const discountType = dto.discountType === undefined ? existing.discountType : dto.discountType;
    const discountValue =
      dto.discountValue === undefined ? existing.discountValue?.toString() : dto.discountValue;
    const taxRate = dto.taxRate === undefined ? existing.taxRate?.toString() : dto.taxRate;
    const calculated = this.calculate(items, discountType, discountValue, taxRate);
    return this.prisma.$transaction(async (tx) => {
      await tx.quotationItem.deleteMany({
        where: { quotationId: id, organizationId: principal.organizationId },
      });
      const quotation = await tx.quotation.update({
        where: { id },
        data: {
          companyId: dto.companyId,
          contactId: dto.contactId,
          leadId: dto.leadId,
          projectId: dto.projectId,
          issueDate: dto.issueDate ? dateOnly(dto.issueDate) : undefined,
          expiryDate: dto.expiryDate === null ? null : dateOnly(dto.expiryDate),
          currency: dto.currency?.toUpperCase(),
          discountType,
          discountValue,
          taxRate,
          notes: dto.notes,
          terms: dto.terms,
          ...calculated,
          items: {
            create: calculated.items.map((item, position) => ({
              ...item,
              position,
              organizationId: principal.organizationId,
            })),
          },
        },
        include: detailInclude,
      });
      await this.audit.create(
        {
          action: 'QUOTATION_UPDATED',
          actorId: principal.userId,
          entityId: id,
          entityType: 'QUOTATION',
          organizationId: principal.organizationId,
          metadata: { quotationNumber: quotation.quotationNumber },
        },
        tx,
      );
      return publicQuotation(quotation);
    });
  }

  async archive(principal: AuthenticatedPrincipal, id: string) {
    const existing = await this.requireDraft(principal.organizationId, id);
    return this.prisma.$transaction(async (tx) => {
      const quotation = await tx.quotation.update({
        where: { id },
        data: { archivedAt: new Date() },
        include: summaryInclude,
      });
      await this.audit.create(
        {
          action: 'QUOTATION_ARCHIVED',
          actorId: principal.userId,
          entityId: id,
          entityType: 'QUOTATION',
          organizationId: principal.organizationId,
          metadata: { quotationNumber: existing.quotationNumber },
        },
        tx,
      );
      return publicQuotation(quotation);
    });
  }

  async transition(
    principal: AuthenticatedPrincipal,
    id: string,
    action: 'send' | 'accept' | 'reject',
  ) {
    await this.expireDue(principal.organizationId);
    const quotation = await this.prisma.quotation.findFirst({
      where: { id, organizationId: principal.organizationId, archivedAt: null },
      include: detailInclude,
    });
    if (!quotation) throw new NotFoundException('Quotation not found');
    const allowed = action === 'send' ? quotation.status === 'DRAFT' : quotation.status === 'SENT';
    if (!allowed)
      throw new ConflictException(`Quotation cannot be marked ${action} from ${quotation.status}`);
    const now = new Date();
    const status = action === 'send' ? 'SENT' : action === 'accept' ? 'ACCEPTED' : 'REJECTED';
    let snapshotKey: string | undefined;
    if (action === 'send') {
      snapshotKey = randomUUID();
      await this.storage.put(snapshotKey, await this.pdf.generate(quotation));
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const changed = await tx.quotation.updateMany({
          where: {
            id,
            organizationId: principal.organizationId,
            status: quotation.status,
            archivedAt: null,
          },
          data: {
            status,
            ...(action === 'send'
              ? { sentAt: now, pdfSnapshotKey: snapshotKey, pdfSnapshotAt: now }
              : {}),
            ...(action === 'accept' ? { acceptedAt: now } : {}),
            ...(action === 'reject' ? { rejectedAt: now } : {}),
          },
        });
        if (changed.count !== 1)
          throw new ConflictException('Quotation status changed; reload and try again');
        await this.audit.create(
          {
            action: `QUOTATION_${status}`,
            actorId: principal.userId,
            entityId: id,
            entityType: 'QUOTATION',
            organizationId: principal.organizationId,
            metadata: { quotationNumber: quotation.quotationNumber },
          },
          tx,
        );
        await this.relatedActivity(
          tx,
          quotation,
          principal.organizationId,
          principal.userId,
          status.toLowerCase(),
        );
        if (action === 'accept' && quotation.createdById !== principal.userId) {
          await this.notifications.create(
            {
              organizationId: principal.organizationId,
              userId: quotation.createdById,
              type: 'QUOTATION_ACCEPTED',
              title: 'Quotation accepted',
              message: quotation.quotationNumber,
              entityType: 'QUOTATION',
              entityId: quotation.id,
              dedupeKey: `quotation:${quotation.id}:accepted`,
            },
            tx,
          );
        }
        return publicQuotation(
          await tx.quotation.findUniqueOrThrow({ where: { id }, include: detailInclude }),
        );
      });
    } catch (error) {
      if (snapshotKey) await this.storage.delete(snapshotKey);
      throw error;
    }
  }

  async pdfContent(principal: AuthenticatedPrincipal, id: string) {
    await this.expireDue(principal.organizationId);
    const quotation = await this.prisma.quotation.findFirst({
      where: { id, organizationId: principal.organizationId, archivedAt: null },
      include: detailInclude,
    });
    if (!quotation) throw new NotFoundException('Quotation not found');
    const content = quotation.pdfSnapshotKey
      ? await this.storage.get(quotation.pdfSnapshotKey)
      : await this.pdf.generate(quotation);
    return { content, fileName: `${quotation.quotationNumber}.pdf` };
  }

  private calculate(
    items: CreateQuotationDto['items'],
    discountType?: string | null,
    discountValue?: string | null,
    taxRate?: string | null,
  ) {
    const calculatedItems = items.map((item) => {
      const quantity = new Prisma.Decimal(item.quantity);
      const unitPrice = new Prisma.Decimal(item.unitPrice);
      if (quantity.lessThanOrEqualTo(0) || unitPrice.isNegative())
        throw new BadRequestException(
          'Item quantity must be greater than zero and unit price cannot be negative',
        );
      return {
        description: item.description,
        quantity,
        unitPrice,
        amount: quantity.times(unitPrice).toDecimalPlaces(2),
      };
    });
    const subtotal = calculatedItems
      .reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0))
      .toDecimalPlaces(2);
    const discount = discountValue ? new Prisma.Decimal(discountValue) : new Prisma.Decimal(0);
    if (discount.isNegative()) throw new BadRequestException('Discount cannot be negative');
    if (discountType === 'PERCENTAGE' && discount.greaterThan(100))
      throw new BadRequestException('Percentage discount cannot exceed 100');
    if (!discountType && !discount.isZero())
      throw new BadRequestException('discountType is required when discountValue is set');
    const discountAmount = (
      discountType === 'PERCENTAGE'
        ? subtotal.times(discount).dividedBy(100)
        : discountType === 'FIXED'
          ? discount
          : new Prisma.Decimal(0)
    ).toDecimalPlaces(2);
    if (discountAmount.greaterThan(subtotal))
      throw new BadRequestException('Discount cannot exceed subtotal');
    const taxable = subtotal.minus(discountAmount);
    const tax = taxRate ? new Prisma.Decimal(taxRate) : new Prisma.Decimal(0);
    if (tax.isNegative() || tax.greaterThan(100))
      throw new BadRequestException('Tax rate must be between 0 and 100');
    const taxAmount = taxable.times(tax).dividedBy(100).toDecimalPlaces(2);
    return {
      items: calculatedItems,
      subtotal,
      discountAmount,
      taxAmount,
      total: taxable.plus(taxAmount).toDecimalPlaces(2),
    };
  }

  private async validateAssociations(
    organizationId: string,
    companyId: string,
    contactId?: string | null,
    leadId?: string | null,
    projectId?: string | null,
  ) {
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, organizationId, archivedAt: null },
      select: { id: true },
    });
    if (!company) throw new NotFoundException('Company not found');
    if (contactId) {
      const contact = await this.prisma.contact.findFirst({
        where: { id: contactId, organizationId, archivedAt: null },
        select: { companyId: true },
      });
      if (!contact) throw new NotFoundException('Contact not found');
      if (contact.companyId !== companyId)
        throw new BadRequestException('Contact must belong to the selected company');
    }
    if (leadId) {
      const lead = await this.prisma.lead.findFirst({
        where: { id: leadId, organizationId, archivedAt: null },
        select: { companyId: true },
      });
      if (!lead) throw new NotFoundException('Lead not found');
      if (lead.companyId !== companyId)
        throw new BadRequestException('Lead must belong to the selected company');
    }
    if (projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: projectId, organizationId, archivedAt: null },
        select: { companyId: true },
      });
      if (!project) throw new NotFoundException('Project not found');
      if (project.companyId !== companyId)
        throw new BadRequestException('Project must belong to the selected company');
    }
  }

  private validateDates(issueDate: string, expiryDate?: string | null) {
    if (expiryDate && dateOnly(expiryDate)! < dateOnly(issueDate)!)
      throw new BadRequestException('expiryDate must not be before issueDate');
  }

  private async requireDraft(organizationId: string, id: string) {
    const quotation = await this.prisma.quotation.findFirst({
      where: { id, organizationId, archivedAt: null },
      include: { items: { orderBy: { position: 'asc' } } },
    });
    if (!quotation) throw new NotFoundException('Quotation not found');
    if (quotation.status !== 'DRAFT')
      throw new ConflictException('Only draft quotations can be modified');
    return quotation;
  }

  private expireDue(organizationId: string) {
    return this.prisma.quotation.updateMany({
      where: {
        organizationId,
        status: 'SENT',
        expiryDate: { lt: dateOnly(new Date().toISOString()) },
      },
      data: { status: 'EXPIRED' },
    });
  }

  private async relatedActivity(
    tx: Prisma.TransactionClient,
    quotation: {
      id: string;
      quotationNumber: string;
      companyId: string;
      leadId: string | null;
      projectId: string | null;
    },
    organizationId: string,
    actorId: string,
    verb: string,
  ) {
    const targets = [
      { entityType: 'COMPANY', entityId: quotation.companyId },
      ...(quotation.projectId ? [{ entityType: 'PROJECT', entityId: quotation.projectId }] : []),
    ];
    await tx.activityLog.createMany({
      data: targets.map((target) => ({
        organizationId,
        actorId,
        ...target,
        action: 'QUOTATION_ACTIVITY',
        metadata: { quotationId: quotation.id, quotationNumber: quotation.quotationNumber, verb },
      })),
    });
    if (quotation.leadId) {
      await tx.leadActivity.create({
        data: {
          organizationId,
          leadId: quotation.leadId,
          type: 'SYSTEM',
          title: `Quotation ${quotation.quotationNumber} ${verb}`,
          createdById: actorId,
          metadata: { quotationId: quotation.id, quotationNumber: quotation.quotationNumber },
        },
      });
      await tx.lead.update({
        where: { id: quotation.leadId },
        data: { lastActivityAt: new Date() },
      });
    }
  }
}
