import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isEmail, isURL, isUUID } from 'class-validator';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import { Prisma, type PrismaClient } from '../generated/prisma/client';
import type {
  DataExportEntityType,
  DataImportEntityType,
  DuplicateEntityType,
  MergeEntityType,
} from '../generated/prisma/enums';
import { PrismaService } from '../database/prisma.service';
import { PipelinesService } from '../pipelines/pipelines.service';
import type {
  BulkUpdateDto,
  CommitImportDto,
  CreateExportDto,
  ImportPreviewDto,
} from './dto/data-management.dto';

type DataEntity = 'companies' | 'contacts' | 'leads' | 'projects' | 'tasks';
type DbClient = Prisma.TransactionClient | PrismaService | PrismaClient;
type CsvRow = Record<string, string>;
type CsvIssue = { message: string; row: number };
type DuplicateCandidate = {
  key: string;
  matches: { id: string; label: string; secondary?: string | null }[];
};

const csvLimit = 2_000;
const textLimit = 10_000;

const importHeaders: Record<DataImportEntityType, string[]> = {
  COMPANY: ['name', 'website', 'email', 'phone', 'status'],
  CONTACT: ['firstName', 'lastName', 'companyId', 'jobTitle', 'email', 'phone', 'isPrimary'],
  LEAD: [
    'title',
    'firstName',
    'lastName',
    'email',
    'phone',
    'source',
    'priority',
    'companyId',
    'contactId',
    'estimatedValue',
    'currency',
  ],
};

const exportHeaders: Record<DataExportEntityType, string[]> = {
  COMPANY: ['id', 'name', 'website', 'email', 'phone', 'industry', 'status', 'createdAt'],
  CONTACT: ['id', 'firstName', 'lastName', 'companyId', 'jobTitle', 'email', 'phone', 'createdAt'],
  LEAD: ['id', 'title', 'email', 'phone', 'source', 'priority', 'estimatedValue', 'currency'],
  PROJECT: ['id', 'name', 'companyId', 'status', 'priority', 'projectValue', 'currency'],
  TASK: ['id', 'title', 'projectId', 'assigneeId', 'status', 'priority', 'dueDate'],
};

const auditEntityType: Record<DataEntity, string> = {
  companies: 'COMPANY',
  contacts: 'CONTACT',
  leads: 'LEAD',
  projects: 'PROJECT',
  tasks: 'TASK',
};

function normalize(value: string | undefined) {
  return value?.trim() || undefined;
}

function required(row: CsvRow, field: string, rowNumber: number) {
  const value = normalize(row[field]);
  if (!value) throw new BadRequestException(`Row ${rowNumber}: ${field} is required`);
  return value;
}

function optionalEmail(value: string | undefined, rowNumber: number) {
  const email = normalize(value)?.toLowerCase();
  if (email && !isEmail(email)) throw new BadRequestException(`Row ${rowNumber}: email is invalid`);
  return email;
}

function optionalUrl(value: string | undefined, rowNumber: number) {
  const url = normalize(value);
  if (url && !isURL(url, { require_protocol: true }))
    throw new BadRequestException(`Row ${rowNumber}: website must include http:// or https://`);
  return url;
}

function optionalUuid(value: string | undefined, name: string, rowNumber: number) {
  const id = normalize(value);
  if (id && !isUUID(id, '4')) throw new BadRequestException(`Row ${rowNumber}: ${name} is invalid`);
  return id;
}

function optionalMoney(value: string | undefined, name: string, rowNumber: number) {
  const amount = normalize(value);
  if (amount && !/^\d{1,17}(?:\.\d{1,2})?$/.test(amount))
    throw new BadRequestException(`Row ${rowNumber}: ${name} is invalid`);
  return amount;
}

function parseBoolean(value: string | undefined, rowNumber: number) {
  const normalized = normalize(value)?.toLowerCase();
  if (!normalized) return undefined;
  if (['true', 'yes', '1'].includes(normalized)) return true;
  if (['false', 'no', '0'].includes(normalized)) return false;
  throw new BadRequestException(`Row ${rowNumber}: isPrimary must be true or false`);
}

function enumValue<T extends string>(
  values: readonly T[],
  value: string | undefined,
  name: string,
  row: number,
) {
  const normalized = normalize(value)
    ?.toUpperCase()
    .replace(/[\s-]+/g, '_');
  if (!normalized) return undefined;
  if (!values.includes(normalized as T))
    throw new BadRequestException(`Row ${row}: ${name} is not supported`);
  return normalized as T;
}

function parseCsv(csv: string) {
  const lines = csv
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length);
  if (!lines.length) throw new BadRequestException('CSV must include a header row');
  if (lines.length > csvLimit + 1)
    throw new BadRequestException(`CSV imports are limited to ${csvLimit} rows`);
  const rows = lines.map((line) => parseCsvLine(line));
  const headers = rows[0]!.map((header) => header.trim());
  if (!headers.length || headers.some((header) => !header))
    throw new BadRequestException('CSV headers cannot be empty');
  if (new Set(headers).size !== headers.length)
    throw new BadRequestException('CSV headers must be unique');
  return {
    headers,
    rows: rows
      .slice(1)
      .map((values) =>
        Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ''])),
      ),
  };
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  if (quoted) throw new BadRequestException('CSV contains an unterminated quoted value');
  values.push(current);
  return values;
}

function csvEscape(value: unknown) {
  if (value === null || value === undefined) return '';
  const text =
    value instanceof Date
      ? value.toISOString()
      : typeof value === 'object'
        ? JSON.stringify(value)
        : typeof value === 'string'
          ? value
          : typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint'
            ? value.toString()
            : '';
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(headers: string[], rows: Record<string, unknown>[]) {
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(',')),
  ].join('\n');
}

function asJson(value: Record<string, unknown>) {
  return value as Prisma.InputJsonValue;
}

function definedStrings(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value));
}

@Injectable()
export class DataManagementService {
  constructor(
    @Inject(PipelinesService) private readonly pipelines: PipelinesService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  listJobs(principal: AuthenticatedPrincipal) {
    return this.prisma.$transaction(async (tx) => {
      const [imports, exports] = await Promise.all([
        tx.dataImportJob.findMany({
          where: { organizationId: principal.organizationId },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
        tx.dataExportJob.findMany({
          where: { organizationId: principal.organizationId },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
      ]);
      return { imports, exports };
    });
  }

  previewImport(dto: ImportPreviewDto) {
    const parsed = parseCsv(dto.csv);
    const allowed = new Set(importHeaders[dto.entityType]);
    const unsupported = parsed.headers.filter((header) => !allowed.has(header));
    const issues: CsvIssue[] = unsupported.map((header) => ({
      row: 1,
      message: `Unsupported column: ${header}`,
    }));
    for (const [index, row] of parsed.rows.entries()) {
      try {
        this.validateImportRow(dto.entityType, row, index + 2);
      } catch (cause) {
        if (cause instanceof BadRequestException)
          issues.push({ row: index + 2, message: String(cause.message) });
        else throw cause;
      }
    }
    return {
      headers: parsed.headers,
      issues,
      rows: parsed.rows.slice(0, 20),
      totalRows: parsed.rows.length,
    };
  }

  async commitImport(principal: AuthenticatedPrincipal, dto: CommitImportDto) {
    const parsed = parseCsv(dto.csv);
    const preview = this.previewImport(dto);
    if (dto.dryRun) return preview;
    const errorRows: Record<string, unknown>[] = [];
    const job = await this.prisma.dataImportJob.create({
      data: {
        organizationId: principal.organizationId,
        entityType: dto.entityType,
        fileName: dto.fileName,
        status: 'PROCESSING',
        totalRows: parsed.rows.length,
        createdById: principal.userId,
      },
    });
    let successRows = 0;
    for (const [index, row] of parsed.rows.entries()) {
      try {
        await this.createImportedRecord(principal, dto.entityType, row, index + 2);
        successRows += 1;
      } catch (cause) {
        errorRows.push({
          ...row,
          error: cause instanceof Error ? cause.message : 'Import failed',
          row: index + 2,
        });
      }
    }
    const failedRows = parsed.rows.length - successRows;
    return this.prisma.dataImportJob.update({
      where: { id: job.id },
      data: {
        completedAt: new Date(),
        errorReportCsv: failedRows ? toCsv([...parsed.headers, 'row', 'error'], errorRows) : null,
        failedRows,
        processedRows: parsed.rows.length,
        status: failedRows ? (successRows ? 'COMPLETED_WITH_ERRORS' : 'FAILED') : 'COMPLETED',
        successRows,
      },
    });
  }

  async exportData(principal: AuthenticatedPrincipal, dto: CreateExportDto) {
    const rows = await this.findExportRows(principal, dto.entityType, dto.filters ?? {});
    const headers = exportHeaders[dto.entityType];
    const csv = toCsv(headers, rows);
    const job = await this.prisma.dataExportJob.create({
      data: {
        organizationId: principal.organizationId,
        entityType: dto.entityType,
        fileName: `${dto.entityType.toLowerCase()}-export-${new Date().toISOString().slice(0, 10)}.csv`,
        status: 'COMPLETED',
        rowCount: rows.length,
        sizeBytes: Buffer.byteLength(csv, 'utf8'),
        filters: asJson(dto.filters ?? {}),
        createdById: principal.userId,
        completedAt: new Date(),
      },
    });
    return { ...job, csv };
  }

  async downloadExport(principal: AuthenticatedPrincipal, id: string) {
    const job = await this.prisma.dataExportJob.findFirst({
      where: { id, organizationId: principal.organizationId },
    });
    if (!job) throw new NotFoundException('Export job not found');
    const rows = await this.findExportRows(
      principal,
      job.entityType,
      job.filters && !Array.isArray(job.filters) && typeof job.filters === 'object'
        ? job.filters
        : {},
    );
    return { csv: toCsv(exportHeaders[job.entityType], rows), fileName: job.fileName };
  }

  async duplicates(principal: AuthenticatedPrincipal, entityType: DuplicateEntityType) {
    if (entityType === 'COMPANY') {
      const rows = await this.prisma.company.findMany({
        where: { organizationId: principal.organizationId, archivedAt: null },
        select: { id: true, name: true, email: true, phone: true },
      });
      return this.groupDuplicates(
        rows.map((row) => ({
          id: row.id,
          label: row.name,
          secondary: row.email ?? row.phone,
          keys: definedStrings([row.name.toLowerCase(), row.email?.toLowerCase(), row.phone]),
        })),
      );
    }
    if (entityType === 'CONTACT') {
      const rows = await this.prisma.contact.findMany({
        where: { organizationId: principal.organizationId, archivedAt: null },
        select: { id: true, firstName: true, lastName: true, email: true, phone: true },
      });
      return this.groupDuplicates(
        rows.map((row) => ({
          id: row.id,
          label: `${row.firstName} ${row.lastName}`,
          secondary: row.email ?? row.phone,
          keys: definedStrings([row.email?.toLowerCase(), row.phone]),
        })),
      );
    }
    const rows = await this.prisma.lead.findMany({
      where: { organizationId: principal.organizationId, archivedAt: null },
      select: { id: true, title: true, email: true, phone: true },
    });
    return this.groupDuplicates(
      rows.map((row) => ({
        id: row.id,
        label: row.title,
        secondary: row.email ?? row.phone,
        keys: definedStrings([row.email?.toLowerCase(), row.phone]),
      })),
    );
  }

  async merge(
    principal: AuthenticatedPrincipal,
    entityType: MergeEntityType,
    sourceId: string,
    targetId: string,
  ) {
    if (sourceId === targetId)
      throw new BadRequestException('Source and target must be different records');
    if (entityType === 'COMPANY') return this.mergeCompanies(principal, sourceId, targetId);
    return this.mergeContacts(principal, sourceId, targetId);
  }

  async bulkUpdate(principal: AuthenticatedPrincipal, entity: DataEntity, dto: BulkUpdateDto) {
    const ids = [...new Set(dto.ids)];
    const updates = this.validateBulkUpdates(entity, dto.updates);
    return this.prisma.$transaction(async (tx) => {
      const found = await this.existingActiveIds(tx, principal.organizationId, entity, ids);
      if (found.length !== ids.length)
        throw new NotFoundException('One or more records were not found');
      const result = await this.applyBulkUpdates(
        tx,
        principal.organizationId,
        entity,
        found,
        updates,
      );
      await tx.activityLog.createMany({
        data: found.map((id) => ({
          organizationId: principal.organizationId,
          actorId: principal.userId,
          entityType: auditEntityType[entity],
          entityId: id,
          action: `${auditEntityType[entity]}_BULK_UPDATED`,
          metadata: asJson({ updates: Object.keys(updates) }),
        })),
      });
      return result;
    });
  }

  private validateImportRow(entityType: DataImportEntityType, row: CsvRow, rowNumber: number) {
    if (entityType === 'COMPANY') {
      required(row, 'name', rowNumber);
      optionalUrl(row.website, rowNumber);
      optionalEmail(row.email, rowNumber);
      enumValue(
        ['PROSPECT', 'ACTIVE_CLIENT', 'INACTIVE'] as const,
        row.status,
        'status',
        rowNumber,
      );
      return;
    }
    if (entityType === 'CONTACT') {
      required(row, 'firstName', rowNumber);
      required(row, 'lastName', rowNumber);
      optionalUuid(row.companyId, 'companyId', rowNumber);
      optionalEmail(row.email, rowNumber);
      parseBoolean(row.isPrimary, rowNumber);
      return;
    }
    required(row, 'title', rowNumber);
    optionalEmail(row.email, rowNumber);
    optionalUuid(row.companyId, 'companyId', rowNumber);
    optionalUuid(row.contactId, 'contactId', rowNumber);
    optionalMoney(row.estimatedValue, 'estimatedValue', rowNumber);
    enumValue(
      [
        'REFERRAL',
        'WEBSITE',
        'FACEBOOK',
        'LINKEDIN',
        'EMAIL',
        'PHONE',
        'EXISTING_CLIENT',
        'PARTNER',
        'OTHER',
      ] as const,
      row.source,
      'source',
      rowNumber,
    );
    enumValue(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const, row.priority, 'priority', rowNumber);
  }

  private async createImportedRecord(
    principal: AuthenticatedPrincipal,
    entityType: DataImportEntityType,
    row: CsvRow,
    rowNumber: number,
  ) {
    this.validateImportRow(entityType, row, rowNumber);
    if (entityType === 'COMPANY') {
      return this.prisma.company.create({
        data: {
          organizationId: principal.organizationId,
          createdById: principal.userId,
          name: required(row, 'name', rowNumber),
          website: optionalUrl(row.website, rowNumber),
          email: optionalEmail(row.email, rowNumber),
          phone: normalize(row.phone),
          status:
            enumValue(
              ['PROSPECT', 'ACTIVE_CLIENT', 'INACTIVE'] as const,
              row.status,
              'status',
              rowNumber,
            ) ?? 'PROSPECT',
        },
      });
    }
    if (entityType === 'CONTACT') {
      const companyId = optionalUuid(row.companyId, 'companyId', rowNumber);
      if (companyId) await this.requireCompany(principal.organizationId, companyId);
      return this.prisma.contact.create({
        data: {
          organizationId: principal.organizationId,
          createdById: principal.userId,
          firstName: required(row, 'firstName', rowNumber),
          lastName: required(row, 'lastName', rowNumber),
          companyId,
          jobTitle: normalize(row.jobTitle),
          email: optionalEmail(row.email, rowNumber),
          normalizedEmail: optionalEmail(row.email, rowNumber),
          phone: normalize(row.phone),
          isPrimary: parseBoolean(row.isPrimary, rowNumber) ?? false,
        },
      });
    }
    const pipeline = await this.pipelines.ensureDefault(principal.organizationId);
    const firstStage = pipeline.stages[0];
    if (!firstStage) throw new ConflictException('The selected pipeline has no valid stage');
    const companyId = optionalUuid(row.companyId, 'companyId', rowNumber);
    const contactId = optionalUuid(row.contactId, 'contactId', rowNumber);
    if (companyId) await this.requireCompany(principal.organizationId, companyId);
    if (contactId) await this.requireContact(principal.organizationId, contactId);
    return this.prisma.lead.create({
      data: {
        organizationId: principal.organizationId,
        createdById: principal.userId,
        title: required(row, 'title', rowNumber),
        firstName: normalize(row.firstName),
        lastName: normalize(row.lastName),
        email: optionalEmail(row.email, rowNumber),
        normalizedEmail: optionalEmail(row.email, rowNumber),
        phone: normalize(row.phone),
        source: enumValue(
          [
            'REFERRAL',
            'WEBSITE',
            'FACEBOOK',
            'LINKEDIN',
            'EMAIL',
            'PHONE',
            'EXISTING_CLIENT',
            'PARTNER',
            'OTHER',
          ] as const,
          row.source,
          'source',
          rowNumber,
        ),
        priority:
          enumValue(
            ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const,
            row.priority,
            'priority',
            rowNumber,
          ) ?? 'MEDIUM',
        companyId,
        contactId,
        pipelineId: pipeline.id,
        stageId: firstStage.id,
        estimatedValue: optionalMoney(row.estimatedValue, 'estimatedValue', rowNumber),
        currency: normalize(row.currency)?.toUpperCase() ?? 'BDT',
      },
    });
  }

  private async findExportRows(
    principal: AuthenticatedPrincipal,
    entityType: DataExportEntityType,
    filters: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]> {
    if (Object.keys(filters).length)
      throw new BadRequestException('Saved export filters are not supported yet');
    if (entityType === 'COMPANY')
      return this.prisma.company.findMany({
        where: { organizationId: principal.organizationId, archivedAt: null },
        select: {
          id: true,
          name: true,
          website: true,
          email: true,
          phone: true,
          industry: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    if (entityType === 'CONTACT')
      return this.prisma.contact.findMany({
        where: { organizationId: principal.organizationId, archivedAt: null },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          companyId: true,
          jobTitle: true,
          email: true,
          phone: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    if (entityType === 'LEAD')
      return this.prisma.lead.findMany({
        where: { organizationId: principal.organizationId, archivedAt: null },
        select: {
          id: true,
          title: true,
          email: true,
          phone: true,
          source: true,
          priority: true,
          estimatedValue: true,
          currency: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    if (entityType === 'PROJECT')
      return this.prisma.project.findMany({
        where: { organizationId: principal.organizationId, archivedAt: null },
        select: {
          id: true,
          name: true,
          companyId: true,
          status: true,
          priority: true,
          projectValue: true,
          currency: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    return this.prisma.task.findMany({
      where: { organizationId: principal.organizationId, archivedAt: null },
      select: {
        id: true,
        title: true,
        projectId: true,
        assigneeId: true,
        status: true,
        priority: true,
        dueDate: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private groupDuplicates(
    rows: { id: string; keys: string[]; label: string; secondary?: string | null }[],
  ) {
    const groups = new Map<string, DuplicateCandidate>();
    for (const row of rows) {
      for (const key of row.keys) {
        const existing = groups.get(key) ?? { key, matches: [] };
        existing.matches.push({ id: row.id, label: row.label, secondary: row.secondary });
        groups.set(key, existing);
      }
    }
    return [...groups.values()].filter((group) => group.matches.length > 1);
  }

  private async mergeCompanies(
    principal: AuthenticatedPrincipal,
    sourceId: string,
    targetId: string,
  ) {
    await this.requireCompany(principal.organizationId, sourceId);
    await this.requireCompany(principal.organizationId, targetId);
    return this.prisma.$transaction(async (tx) => {
      await tx.contact.updateMany({
        where: { organizationId: principal.organizationId, companyId: sourceId },
        data: { companyId: targetId },
      });
      await tx.lead.updateMany({
        where: { organizationId: principal.organizationId, companyId: sourceId },
        data: { companyId: targetId },
      });
      await tx.project.updateMany({
        where: { organizationId: principal.organizationId, companyId: sourceId },
        data: { companyId: targetId },
      });
      await tx.quotation.updateMany({
        where: { organizationId: principal.organizationId, companyId: sourceId },
        data: { companyId: targetId },
      });
      await tx.payment.updateMany({
        where: { organizationId: principal.organizationId, companyId: sourceId },
        data: { companyId: targetId },
      });
      await tx.company.update({
        where: { id: sourceId },
        data: { archivedAt: new Date(), status: 'ARCHIVED' },
      });
      const record = await tx.dataMergeRecord.create({
        data: {
          organizationId: principal.organizationId,
          entityType: 'COMPANY',
          sourceId,
          targetId,
          createdById: principal.userId,
          metadata: asJson({
            reassigned: ['contacts', 'leads', 'projects', 'quotations', 'payments'],
          }),
        },
      });
      await tx.activityLog.create({
        data: {
          organizationId: principal.organizationId,
          actorId: principal.userId,
          entityType: 'COMPANY',
          entityId: targetId,
          action: 'COMPANY_MERGED',
          metadata: asJson({ sourceId }),
        },
      });
      return record;
    });
  }

  private async mergeContacts(
    principal: AuthenticatedPrincipal,
    sourceId: string,
    targetId: string,
  ) {
    const source = await this.requireContact(principal.organizationId, sourceId);
    await this.requireContact(principal.organizationId, targetId);
    return this.prisma.$transaction(async (tx) => {
      await tx.lead.updateMany({
        where: { organizationId: principal.organizationId, contactId: sourceId },
        data: { contactId: targetId },
      });
      await tx.quotation.updateMany({
        where: { organizationId: principal.organizationId, contactId: sourceId },
        data: { contactId: targetId },
      });
      await tx.contact.update({
        where: { id: sourceId },
        data: { archivedAt: new Date(), isPrimary: false },
      });
      if (source.isPrimary && source.companyId)
        await tx.contact.update({
          where: { id: targetId },
          data: { companyId: source.companyId, isPrimary: true },
        });
      const record = await tx.dataMergeRecord.create({
        data: {
          organizationId: principal.organizationId,
          entityType: 'CONTACT',
          sourceId,
          targetId,
          createdById: principal.userId,
          metadata: asJson({ reassigned: ['leads', 'quotations'] }),
        },
      });
      await tx.activityLog.create({
        data: {
          organizationId: principal.organizationId,
          actorId: principal.userId,
          entityType: 'CONTACT',
          entityId: targetId,
          action: 'CONTACT_MERGED',
          metadata: asJson({ sourceId }),
        },
      });
      return record;
    });
  }

  private validateBulkUpdates(entity: DataEntity, updates: Record<string, unknown>) {
    if (!Object.keys(updates).length)
      throw new BadRequestException('At least one update field is required');
    const allowed: Record<DataEntity, string[]> = {
      companies: ['status', 'accountOwnerId'],
      contacts: ['companyId'],
      leads: ['priority', 'ownerId', 'companyId'],
      projects: ['status', 'priority', 'projectManagerId'],
      tasks: ['status', 'priority', 'assigneeId'],
    };
    const unknown = Object.keys(updates).find((field) => !allowed[entity].includes(field));
    if (unknown) throw new BadRequestException(`${unknown} cannot be bulk updated`);
    if (
      Object.values(updates).some((value) => typeof value === 'string' && value.length > textLimit)
    )
      throw new BadRequestException('Bulk update values are too large');
    return updates;
  }

  private existingActiveIds(
    client: DbClient,
    organizationId: string,
    entity: DataEntity,
    ids: string[],
  ) {
    const where = { organizationId, id: { in: ids }, archivedAt: null };
    if (entity === 'companies')
      return client.company
        .findMany({ where, select: { id: true } })
        .then((rows) => rows.map((row) => row.id));
    if (entity === 'contacts')
      return client.contact
        .findMany({ where, select: { id: true } })
        .then((rows) => rows.map((row) => row.id));
    if (entity === 'leads')
      return client.lead
        .findMany({ where, select: { id: true } })
        .then((rows) => rows.map((row) => row.id));
    if (entity === 'projects')
      return client.project
        .findMany({ where, select: { id: true } })
        .then((rows) => rows.map((row) => row.id));
    return client.task
      .findMany({ where, select: { id: true } })
      .then((rows) => rows.map((row) => row.id));
  }

  private async applyBulkUpdates(
    client: DbClient,
    organizationId: string,
    entity: DataEntity,
    ids: string[],
    updates: Record<string, unknown>,
  ) {
    const data = await this.validatedBulkData(organizationId, entity, updates);
    if (entity === 'companies')
      return client.company.updateMany({ where: { organizationId, id: { in: ids } }, data });
    if (entity === 'contacts')
      return client.contact.updateMany({ where: { organizationId, id: { in: ids } }, data });
    if (entity === 'leads')
      return client.lead.updateMany({ where: { organizationId, id: { in: ids } }, data });
    if (entity === 'projects')
      return client.project.updateMany({ where: { organizationId, id: { in: ids } }, data });
    return client.task.updateMany({ where: { organizationId, id: { in: ids } }, data });
  }

  private async validatedBulkData(
    organizationId: string,
    entity: DataEntity,
    updates: Record<string, unknown>,
  ) {
    if ('accountOwnerId' in updates) await this.requireUser(organizationId, updates.accountOwnerId);
    if ('ownerId' in updates) await this.requireUser(organizationId, updates.ownerId);
    if ('projectManagerId' in updates)
      await this.requireUser(organizationId, updates.projectManagerId);
    if ('assigneeId' in updates) await this.requireUser(organizationId, updates.assigneeId);
    if ('companyId' in updates && updates.companyId !== null)
      await this.requireCompany(organizationId, updates.companyId);
    if ('status' in updates) {
      if (entity === 'companies')
        updates.status = enumUpdate(
          ['PROSPECT', 'ACTIVE_CLIENT', 'INACTIVE'] as const,
          updates.status,
          'status',
        );
      if (entity === 'projects')
        updates.status = enumUpdate(
          ['PLANNED', 'IN_PROGRESS', 'ON_HOLD', 'IN_REVIEW', 'COMPLETED', 'CANCELLED'] as const,
          updates.status,
          'status',
        );
      if (entity === 'tasks')
        updates.status = enumUpdate(
          ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED', 'BLOCKED'] as const,
          updates.status,
          'status',
        );
    }
    if ('priority' in updates) {
      if (entity === 'leads')
        updates.priority = enumUpdate(
          ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const,
          updates.priority,
          'priority',
        );
      if (entity === 'projects' || entity === 'tasks')
        updates.priority = enumUpdate(
          ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const,
          updates.priority,
          'priority',
        );
    }
    return updates;
  }

  private async requireCompany(organizationId: string, id: unknown) {
    if (typeof id !== 'string' || !isUUID(id, '4'))
      throw new BadRequestException('Company is invalid');
    const company = await this.prisma.company.findFirst({
      where: { id, organizationId, archivedAt: null },
    });
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  private async requireContact(organizationId: string, id: unknown) {
    if (typeof id !== 'string' || !isUUID(id, '4'))
      throw new BadRequestException('Contact is invalid');
    const contact = await this.prisma.contact.findFirst({
      where: { id, organizationId, archivedAt: null },
    });
    if (!contact) throw new NotFoundException('Contact not found');
    return contact;
  }

  private async requireUser(organizationId: string, id: unknown) {
    if (id === null || id === undefined || id === '') return;
    if (typeof id !== 'string' || !isUUID(id, '4'))
      throw new BadRequestException('User is invalid');
    const user = await this.prisma.user.findFirst({
      where: { id, organizationId, status: 'ACTIVE' },
    });
    if (!user) throw new NotFoundException('Active organization user not found');
  }
}

function enumUpdate<T extends string>(values: readonly T[], value: unknown, name: string) {
  if (typeof value !== 'string') throw new BadRequestException(`${name} is invalid`);
  const normalized = value.toUpperCase().replace(/[\s-]+/g, '_');
  if (!values.includes(normalized as T)) throw new BadRequestException(`${name} is not supported`);
  return normalized as T;
}
