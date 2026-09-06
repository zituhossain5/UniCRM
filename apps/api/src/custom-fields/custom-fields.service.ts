import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isEmail, isURL } from 'class-validator';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { Prisma, type PrismaClient } from '../generated/prisma/client';
import type { ConfigurableEntityType, CustomFieldType } from '../generated/prisma/enums';
import { PrismaService } from '../database/prisma.service';
import type {
  CreateCustomFieldDefinitionDto,
  ReorderCustomFieldsDto,
  UpdateCustomFieldDefinitionDto,
} from './dto/custom-fields.dto';

type DbClient = Prisma.TransactionClient | PrismaService | PrismaClient;
const keyPattern = /^[a-z][a-z0-9_]{0,79}$/;

function normalizeCustomFieldKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

@Injectable()
export class CustomFieldsService {
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async list(
    principal: AuthenticatedPrincipal,
    entityType: ConfigurableEntityType,
    active?: boolean,
  ) {
    return this.prisma.customFieldDefinition.findMany({
      where: {
        organizationId: principal.organizationId,
        entityType,
        ...(active === undefined ? {} : { active }),
      },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async create(principal: AuthenticatedPrincipal, dto: CreateCustomFieldDefinitionDto) {
    const input = { ...dto, key: this.validKey(dto.key) };
    const options = this.validateOptions(input.fieldType, input.options);
    const position = await this.prisma.customFieldDefinition.count({
      where: { organizationId: principal.organizationId, entityType: input.entityType },
    });
    try {
      return await this.prisma.$transaction(async (tx) => {
        const definition = await tx.customFieldDefinition.create({
          data: { ...input, options, position, organizationId: principal.organizationId },
        });
        await this.audit.create(
          {
            action: 'CUSTOM_FIELD_CREATED',
            actorId: principal.userId,
            entityId: definition.id,
            entityType: 'CUSTOM_FIELD',
            organizationId: principal.organizationId,
            metadata: { entityType: input.entityType, fieldType: input.fieldType, key: input.key },
          },
          tx,
        );
        return definition;
      });
    } catch (cause) {
      if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2002')
        throw new ConflictException('A custom field with this key already exists');
      throw cause;
    }
  }

  async update(principal: AuthenticatedPrincipal, id: string, dto: UpdateCustomFieldDefinitionDto) {
    const definition = await this.definition(principal.organizationId, id);
    const input = dto.key === undefined ? dto : { ...dto, key: this.validKey(dto.key) };
    if (
      (input.fieldType && input.fieldType !== definition.fieldType) ||
      (input.key && input.key !== definition.key)
    ) {
      const values = await this.prisma.customFieldValue.count({ where: { fieldDefinitionId: id } });
      if (values)
        throw new ConflictException('Key and type cannot change after values have been stored');
    }
    const fieldType = input.fieldType ?? definition.fieldType;
    const options =
      input.options === undefined && input.fieldType === undefined
        ? undefined
        : this.validateOptions(fieldType, input.options);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.customFieldDefinition.update({
          where: { id },
          data: { ...input, options },
        });
        await this.audit.create(
          {
            action: updated.active ? 'CUSTOM_FIELD_UPDATED' : 'CUSTOM_FIELD_DEACTIVATED',
            actorId: principal.userId,
            entityId: id,
            entityType: 'CUSTOM_FIELD',
            organizationId: principal.organizationId,
          },
          tx,
        );
        return updated;
      });
    } catch (cause) {
      if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2002')
        throw new ConflictException('A custom field with this key already exists');
      throw cause;
    }
  }

  async reorder(
    principal: AuthenticatedPrincipal,
    entityType: ConfigurableEntityType,
    dto: ReorderCustomFieldsDto,
  ) {
    const definitions = await this.prisma.customFieldDefinition.findMany({
      where: { organizationId: principal.organizationId, entityType },
      select: { id: true, position: true },
    });
    if (
      definitions.length !== dto.fields.length ||
      definitions.some(({ id }) => !dto.fields.some((field) => field.id === id))
    )
      throw new BadRequestException('Reorder request must include every field for this entity');
    const positions = dto.fields.map(({ position }) => position);
    const orderedPositions = [...positions].sort((left, right) => left - right);
    if (
      new Set(positions).size !== positions.length ||
      orderedPositions.some((position, index) => position !== index)
    )
      throw new BadRequestException('Field positions must be contiguous and start at zero');
    const temporaryBase =
      Math.max(-1, ...definitions.map(({ position }) => position), ...positions) +
      definitions.length +
      1;
    await this.prisma.$transaction(async (tx) => {
      for (const [index, field] of dto.fields.entries())
        await tx.customFieldDefinition.update({
          where: { id: field.id },
          data: { position: temporaryBase + index },
        });
      for (const field of dto.fields)
        await tx.customFieldDefinition.update({
          where: { id: field.id },
          data: { position: field.position },
        });
      await this.audit.create(
        {
          action: 'CUSTOM_FIELDS_REORDERED',
          actorId: principal.userId,
          entityId: principal.organizationId,
          entityType: 'CUSTOM_FIELD',
          organizationId: principal.organizationId,
          metadata: { entityType },
        },
        tx,
      );
    });
    return this.list(principal, entityType);
  }

  async values(organizationId: string, entityType: ConfigurableEntityType, entityId: string) {
    const rows = await this.prisma.customFieldValue.findMany({
      where: { organizationId, entityType, entityId },
      include: { fieldDefinition: true },
      orderBy: { fieldDefinition: { position: 'asc' } },
    });
    return rows.map((row) => ({ definition: row.fieldDefinition, value: row.value }));
  }

  rejectGeneratedControlKeys(input: object) {
    const generatedKey = Object.keys(input).find((key) => key.startsWith('customField:'));
    if (generatedKey)
      throw new BadRequestException(
        `Submit ${generatedKey} under the customFields object instead of as a top-level property`,
      );
  }

  async decorate<T extends { id: string }>(
    organizationId: string,
    entityType: ConfigurableEntityType,
    records: T[],
  ) {
    if (!records.length) return records.map((record) => ({ ...record, customFields: [] }));
    const rows = await this.prisma.customFieldValue.findMany({
      where: { organizationId, entityType, entityId: { in: records.map(({ id }) => id) } },
      include: { fieldDefinition: true },
      orderBy: { fieldDefinition: { position: 'asc' } },
    });
    return records.map((record) => ({
      ...record,
      customFields: rows
        .filter((row) => row.entityId === record.id)
        .map((row) => ({ definition: row.fieldDefinition, value: row.value })),
    }));
  }

  async saveValues(
    client: DbClient,
    organizationId: string,
    entityType: ConfigurableEntityType,
    entityId: string,
    input: Record<string, unknown> | undefined,
    creating: boolean,
  ) {
    const definitions = await client.customFieldDefinition.findMany({
      where: { organizationId, entityType, active: true },
      orderBy: { position: 'asc' },
    });
    const supplied = input ?? {};
    const known = new Map(definitions.map((definition) => [definition.key, definition]));
    const unknown = Object.keys(supplied).find((key) => !known.has(key));
    if (unknown) throw new BadRequestException(`Unknown or inactive custom field: ${unknown}`);
    const existing = creating
      ? []
      : await client.customFieldValue.findMany({ where: { organizationId, entityType, entityId } });
    const existingByDefinition = new Map(existing.map((row) => [row.fieldDefinitionId, row]));
    for (const definition of definitions) {
      const hasInput = Object.hasOwn(supplied, definition.key);
      const raw = supplied[definition.key];
      const current = existingByDefinition.get(definition.id);
      if (!hasInput) {
        if (definition.required && !current)
          throw new BadRequestException(`${definition.name} is required`);
        continue;
      }
      if (raw === null || raw === '' || (Array.isArray(raw) && raw.length === 0)) {
        if (definition.required) throw new BadRequestException(`${definition.name} is required`);
        if (current) await client.customFieldValue.delete({ where: { id: current.id } });
        continue;
      }
      const value = this.validateValue(definition, raw);
      await client.customFieldValue.upsert({
        where: { fieldDefinitionId_entityId: { fieldDefinitionId: definition.id, entityId } },
        create: { organizationId, fieldDefinitionId: definition.id, entityType, entityId, value },
        update: { value },
      });
    }
  }

  async matchingEntityIds(
    organizationId: string,
    entityType: ConfigurableEntityType,
    encoded?: string,
  ) {
    if (!encoded) return undefined;
    let filters: unknown;
    try {
      filters = JSON.parse(encoded);
    } catch {
      throw new BadRequestException('customFields must be valid JSON');
    }
    if (!filters || Array.isArray(filters) || typeof filters !== 'object')
      throw new BadRequestException('customFields must be a JSON object');
    const entries = Object.entries(filters as Record<string, unknown>);
    if (!entries.length) return undefined;
    const definitions = await this.prisma.customFieldDefinition.findMany({
      where: { organizationId, entityType, active: true },
    });
    const known = new Map(definitions.map((definition) => [definition.key, definition]));
    let ids: Set<string> | undefined;
    for (const [key, raw] of entries) {
      const definition = known.get(key);
      if (!definition) throw new BadRequestException(`Unknown or inactive custom field: ${key}`);
      const value = this.validateValue(definition, raw);
      const rows = await this.prisma.customFieldValue.findMany({
        where: {
          organizationId,
          entityType,
          fieldDefinitionId: definition.id,
          value: { equals: value },
        },
        select: { entityId: true },
      });
      const next = new Set(rows.map(({ entityId }) => entityId));
      ids = ids ? new Set([...ids].filter((id) => next.has(id))) : next;
    }
    return [...(ids ?? [])];
  }

  private async definition(organizationId: string, id: string) {
    const definition = await this.prisma.customFieldDefinition.findFirst({
      where: { id, organizationId },
    });
    if (!definition) throw new NotFoundException('Custom field not found');
    return definition;
  }

  private validKey(value: string) {
    const normalized = normalizeCustomFieldKey(value);
    if (!keyPattern.test(normalized))
      throw new BadRequestException(
        'Custom field key must start with a letter and use lowercase letters, numbers, or underscores',
      );
    return normalized;
  }

  private validateOptions(fieldType: CustomFieldType, options?: string[]) {
    const supportsOptions = fieldType === 'SELECT' || fieldType === 'MULTI_SELECT';
    if (!supportsOptions && options?.length)
      throw new BadRequestException('Only select fields may define options');
    if (supportsOptions && (!options || options.length === 0))
      throw new BadRequestException('Select fields require at least one option');
    const normalized = options?.map((option) => option.trim()).filter(Boolean);
    if (
      normalized &&
      new Set(normalized.map((option) => option.toLowerCase())).size !== normalized.length
    )
      throw new BadRequestException('Custom field options must be unique');
    return supportsOptions ? normalized : Prisma.JsonNull;
  }

  private validateValue(
    definition: { fieldType: CustomFieldType; name: string; options: Prisma.JsonValue },
    raw: unknown,
  ): Prisma.InputJsonValue {
    const fail = () => {
      throw new BadRequestException(`${definition.name} has an invalid value`);
    };
    if (definition.fieldType === 'BOOLEAN') {
      if (typeof raw !== 'boolean') fail();
      return raw as boolean;
    }
    if (definition.fieldType === 'NUMBER' || definition.fieldType === 'CURRENCY') {
      if (typeof raw !== 'number' || !Number.isFinite(raw)) fail();
      return raw as number;
    }
    if (definition.fieldType === 'MULTI_SELECT') {
      const options = Array.isArray(definition.options) ? definition.options : [];
      if (
        !Array.isArray(raw) ||
        !raw.every((value) => typeof value === 'string' && options.includes(value)) ||
        new Set(raw).size !== raw.length
      )
        fail();
      return raw as string[];
    }
    if (
      typeof raw !== 'string' ||
      raw.length > (definition.fieldType === 'LONG_TEXT' ? 10000 : 2000)
    )
      fail();
    const value = raw as string;
    const options = Array.isArray(definition.options) ? definition.options : [];
    if (definition.fieldType === 'SELECT' && !options.includes(value)) fail();
    if (definition.fieldType === 'DATE') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) fail();
      const year = Number(value.slice(0, 4));
      const month = Number(value.slice(5, 7));
      const day = Number(value.slice(8, 10));
      const parsed = new Date(Date.UTC(year, month - 1, day));
      if (
        parsed.getUTCFullYear() !== year ||
        parsed.getUTCMonth() !== month - 1 ||
        parsed.getUTCDate() !== day
      )
        fail();
    }
    if (definition.fieldType === 'URL' && !isURL(value, { require_protocol: true })) fail();
    if (definition.fieldType === 'EMAIL' && !isEmail(value)) fail();
    if (definition.fieldType === 'PHONE' && !/^[+()\-\s.\d]{3,40}$/.test(value)) fail();
    return value;
  }
}
