import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import { normalizeListQuery, paginationMeta } from '../common/dto/list-query.dto';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type {
  CatalogListQueryDto,
  CreateCatalogCategoryDto,
  CreateCatalogItemDto,
  UpdateCatalogCategoryDto,
  UpdateCatalogItemDto,
} from './dto/catalog.dto';

const itemInclude = {
  category: { select: { id: true, name: true, active: true, archivedAt: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.CatalogItemInclude;

@Injectable()
export class CatalogService {
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async list(principal: AuthenticatedPrincipal, query: CatalogListQueryDto) {
    const list = normalizeListQuery(query, 'name', [
      'name',
      'type',
      'sku',
      'unitPrice',
      'createdAt',
      'updatedAt',
    ]);
    const where: Prisma.CatalogItemWhereInput = {
      organizationId: principal.organizationId,
      archivedAt: null,
      ...(query.type ? { type: query.type } : {}),
      ...(query.category ? { categoryId: query.category } : {}),
      ...(query.active === undefined
        ? {}
        : { active: query.active === true || (query.active as unknown) === 'true' }),
      ...(query.currency ? { currency: query.currency } : {}),
      ...(list.search
        ? {
            OR: [
              { name: { contains: list.search, mode: 'insensitive' } },
              { sku: { contains: list.search, mode: 'insensitive' } },
              { description: { contains: list.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.catalogItem.findMany({
        where,
        include: itemInclude,
        orderBy: { [list.sort]: list.order },
        skip: (list.page - 1) * list.limit,
        take: list.limit,
      }),
      this.prisma.catalogItem.count({ where }),
    ]);
    return { data, meta: paginationMeta(list.page, list.limit, total) };
  }

  async get(principal: AuthenticatedPrincipal, id: string) {
    const item = await this.prisma.catalogItem.findFirst({
      where: { id, organizationId: principal.organizationId },
      include: itemInclude,
    });
    if (!item) throw new NotFoundException('Catalog item not found');
    return item;
  }

  async referenceData(principal: AuthenticatedPrincipal) {
    const [categories, organization] = await this.prisma.$transaction([
      this.prisma.catalogCategory.findMany({
        where: { organizationId: principal.organizationId, archivedAt: null },
        orderBy: { name: 'asc' },
      }),
      this.prisma.organization.findUniqueOrThrow({
        where: { id: principal.organizationId },
        select: { defaultCurrency: true },
      }),
    ]);
    return { categories, defaultCurrency: organization.defaultCurrency };
  }

  async create(principal: AuthenticatedPrincipal, dto: CreateCatalogItemDto) {
    await this.validateInput(principal.organizationId, dto);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const item = await tx.catalogItem.create({
          data: {
            organizationId: principal.organizationId,
            createdById: principal.userId,
            type: dto.type,
            name: dto.name,
            sku: dto.sku?.toUpperCase() || null,
            description: dto.description || null,
            categoryId: dto.categoryId || null,
            unitPrice: dto.unitPrice,
            currency: dto.currency.toUpperCase(),
            taxRate: dto.taxRate || null,
            active: dto.active ?? true,
          },
          include: itemInclude,
        });
        await this.audit.create(
          {
            action: 'CATALOG_ITEM_CREATED',
            actorId: principal.userId,
            entityId: item.id,
            entityType: 'CATALOG',
            organizationId: principal.organizationId,
            metadata: { name: item.name, sku: item.sku, type: item.type },
          },
          tx,
        );
        return item;
      });
    } catch (cause) {
      this.rethrowUnique(cause);
    }
  }

  async update(principal: AuthenticatedPrincipal, id: string, dto: UpdateCatalogItemDto) {
    const existing = await this.get(principal, id);
    await this.validateInput(principal.organizationId, dto, existing.categoryId ?? undefined);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const item = await tx.catalogItem.update({
          where: { id },
          data: {
            type: dto.type,
            name: dto.name,
            sku: dto.sku === undefined ? undefined : dto.sku?.toUpperCase() || null,
            description: dto.description === undefined ? undefined : dto.description || null,
            categoryId: dto.categoryId === undefined ? undefined : dto.categoryId || null,
            unitPrice: dto.unitPrice,
            currency: dto.currency?.toUpperCase(),
            taxRate: dto.taxRate === undefined ? undefined : dto.taxRate || null,
            active: dto.active,
          },
          include: itemInclude,
        });
        await this.audit.create(
          {
            action: 'CATALOG_ITEM_UPDATED',
            actorId: principal.userId,
            entityId: item.id,
            entityType: 'CATALOG',
            organizationId: principal.organizationId,
            metadata: { fields: Object.keys(dto) },
          },
          tx,
        );
        return item;
      });
    } catch (cause) {
      this.rethrowUnique(cause);
    }
  }

  async archive(principal: AuthenticatedPrincipal, id: string) {
    const existing = await this.get(principal, id);
    if (existing.archivedAt) return existing;
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.catalogItem.update({
        where: { id },
        data: { active: false, archivedAt: new Date() },
        include: itemInclude,
      });
      await this.audit.create(
        {
          action: 'CATALOG_ITEM_ARCHIVED',
          actorId: principal.userId,
          entityId: item.id,
          entityType: 'CATALOG',
          organizationId: principal.organizationId,
          metadata: { name: item.name, sku: item.sku },
        },
        tx,
      );
      return item;
    });
  }

  listCategories(principal: AuthenticatedPrincipal) {
    return this.prisma.catalogCategory.findMany({
      where: { organizationId: principal.organizationId, archivedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  async createCategory(principal: AuthenticatedPrincipal, dto: CreateCatalogCategoryDto) {
    try {
      return await this.prisma.catalogCategory.create({
        data: { organizationId: principal.organizationId, name: dto.name },
      });
    } catch (cause) {
      if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2002')
        throw new ConflictException('A catalog category with this name already exists');
      throw cause;
    }
  }

  async updateCategory(
    principal: AuthenticatedPrincipal,
    id: string,
    dto: UpdateCatalogCategoryDto,
  ) {
    const category = await this.prisma.catalogCategory.findFirst({
      where: { id, organizationId: principal.organizationId, archivedAt: null },
    });
    if (!category) throw new NotFoundException('Catalog category not found');
    try {
      return await this.prisma.catalogCategory.update({ where: { id }, data: dto });
    } catch (cause) {
      if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2002')
        throw new ConflictException('A catalog category with this name already exists');
      throw cause;
    }
  }

  private async validateInput(
    organizationId: string,
    dto: Partial<CreateCatalogItemDto>,
    allowedInactiveCategoryId?: string,
  ) {
    if (dto.categoryId && dto.categoryId !== allowedInactiveCategoryId) {
      const category = await this.prisma.catalogCategory.findFirst({
        where: { id: dto.categoryId, organizationId, archivedAt: null, active: true },
        select: { id: true },
      });
      if (!category) throw new NotFoundException('Catalog category not found');
    }
    if (dto.unitPrice !== undefined && new Prisma.Decimal(dto.unitPrice).isNegative())
      throw new BadRequestException('Unit price cannot be negative');
    if (dto.taxRate !== undefined && dto.taxRate !== null && dto.taxRate !== '') {
      const tax = new Prisma.Decimal(dto.taxRate);
      if (tax.isNegative() || tax.greaterThan(100))
        throw new BadRequestException('Tax rate must be between 0 and 100');
    }
  }

  private rethrowUnique(cause: unknown): never {
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2002')
      throw new ConflictException('A catalog item with this SKU already exists');
    throw cause;
  }
}
