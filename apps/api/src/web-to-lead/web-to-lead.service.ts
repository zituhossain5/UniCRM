import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isEmail } from 'class-validator';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Prisma } from '../generated/prisma/client';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import { RateLimitService } from '../auth/rate-limit.service';
import { AutomationsService } from '../automations/automations.service';
import type { EnvironmentVariables } from '../config/environment';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { PrismaService } from '../database/prisma.service';
import { IntegrationSecretService } from '../integrations/integration-secret.service';
import { JobsService } from '../jobs/jobs.service';
import { TagsService } from '../tags/tags.service';
import type {
  CreateWebToLeadIntegrationDto,
  UpdateWebToLeadIntegrationDto,
  WebToLeadMappingDto,
  WebToLeadPayloadDto,
} from './dto/web-to-lead.dto';
import { WEB_TO_LEAD_EVENT_TYPE, WEB_TO_LEAD_MAPPING_TARGETS } from './web-to-lead.constants';

type SubmissionInput = {
  integrationId: string;
  payload: WebToLeadPayloadDto;
  rawBody: Buffer;
  signature?: string;
  timestamp?: string;
  idempotencyKey?: string;
  remoteAddress: string;
  secure: boolean;
};

type LeadDraft = {
  company?: string;
  description?: string;
  email?: string;
  estimatedValue?: number;
  firstName?: string;
  fullName?: string;
  lastName?: string;
  phone?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  service?: string;
  title?: string;
};

const integrationInclude = {
  connection: {
    select: {
      id: true,
      name: true,
      status: true,
      secretLastFour: true,
      secretRotatedAt: true,
      encryptedSecret: true,
      lastActivityAt: true,
    },
  },
  defaultPipeline: { select: { id: true, name: true } },
  defaultStage: { select: { id: true, name: true } },
  defaultOwner: { select: { id: true, firstName: true, lastName: true, email: true } },
} as const;

const WEB_TO_LEAD_PAYLOAD_FIELDS = new Set([
  'submissionId',
  'name',
  'firstName',
  'lastName',
  'fullName',
  'email',
  'phone',
  'company',
  'subject',
  'message',
  'service',
  'budget',
  'sourceUrl',
  'referrer',
  'utmSource',
  'utmMedium',
  'utmCampaign',
  'submittedAt',
  'estimatedValue',
  'priority',
  'custom',
]);

@Injectable()
export class WebToLeadService {
  private readonly logger = new Logger(WebToLeadService.name);
  private readonly maxPayloadBytes: number;
  private readonly timestampToleranceSeconds: number;
  private readonly rateLimit: number;
  private readonly production: boolean;

  constructor(
    @Inject(AutomationsService) private readonly automations: AutomationsService,
    @Inject(ConfigService) config: ConfigService<EnvironmentVariables, true>,
    @Inject(CustomFieldsService) private readonly customFields: CustomFieldsService,
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RateLimitService) private readonly rates: RateLimitService,
    @Inject(IntegrationSecretService) private readonly secrets: IntegrationSecretService,
    @Inject(TagsService) private readonly tags: TagsService,
  ) {
    this.maxPayloadBytes = config.get('INTEGRATION_WEBHOOK_MAX_BYTES', { infer: true });
    this.timestampToleranceSeconds = config.get('INTEGRATION_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS', {
      infer: true,
    });
    this.rateLimit = config.get('INTEGRATION_WEBHOOK_RATE_LIMIT_MAX', { infer: true });
    this.production = config.get('NODE_ENV', { infer: true }) === 'production';
  }

  async list(principal: AuthenticatedPrincipal) {
    const rows = await this.prisma.webToLeadIntegration.findMany({
      where: { organizationId: principal.organizationId },
      include: integrationInclude,
      orderBy: { createdAt: 'desc' },
    });
    return this.decorate(rows);
  }

  async get(principal: AuthenticatedPrincipal, id: string) {
    const row = await this.requireIntegration(principal.organizationId, id);
    return (await this.decorate([row]))[0];
  }

  async create(principal: AuthenticatedPrincipal, dto: CreateWebToLeadIntegrationDto) {
    await this.validateConfiguration(principal.organizationId, dto);
    const secret = randomBytes(32).toString('base64url');
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const connection = await tx.integrationConnection.create({
          data: {
            organizationId: principal.organizationId,
            name: `Web-to-Lead: ${dto.name}`,
            provider: 'CUSTOM',
            direction: 'INBOUND',
            encryptedSecret: this.secrets.encrypt(secret),
            secretLastFour: secret.slice(-4),
            configuration: { kind: 'WEB_TO_LEAD', version: 1 },
          },
        });
        const integration = await tx.webToLeadIntegration.create({
          data: {
            organizationId: principal.organizationId,
            connectionId: connection.id,
            sourceKey: dto.sourceKey,
            defaultPipelineId: dto.defaultPipelineId,
            defaultStageId: dto.defaultStageId,
            defaultOwnerId: dto.defaultOwnerId,
            defaultPriority: dto.defaultPriority,
            defaultTagIds: dto.defaultTagIds ?? [],
            mappings: dto.mappings as unknown as Prisma.InputJsonArray,
            createdById: principal.userId,
          },
          include: integrationInclude,
        });
        await tx.activityLog.create({
          data: {
            organizationId: principal.organizationId,
            actorId: principal.userId,
            entityType: 'INTEGRATION',
            entityId: integration.id,
            action: 'WEB_TO_LEAD_INTEGRATION_CREATED',
            metadata: { sourceKey: dto.sourceKey },
          },
        });
        return integration;
      });
      return { ...(await this.decorate([result]))[0], secret };
    } catch (error) {
      if (this.isUniqueConflict(error))
        throw new ConflictException(
          'A Web-to-Lead integration with this name or source key exists',
        );
      throw error;
    }
  }

  async update(principal: AuthenticatedPrincipal, id: string, dto: UpdateWebToLeadIntegrationDto) {
    const existing = await this.requireIntegration(principal.organizationId, id);
    const effective = {
      defaultPipelineId: dto.defaultPipelineId ?? existing.defaultPipelineId,
      defaultStageId: dto.defaultStageId ?? existing.defaultStageId,
      defaultOwnerId: dto.clearDefaultOwner
        ? undefined
        : (dto.defaultOwnerId ?? existing.defaultOwnerId ?? undefined),
      defaultPriority: dto.defaultPriority ?? existing.defaultPriority,
      defaultTagIds: dto.defaultTagIds ?? existing.defaultTagIds,
      mappings: dto.mappings ?? (existing.mappings as unknown as WebToLeadMappingDto[]),
      name: dto.name ?? existing.connection.name.replace(/^Web-to-Lead: /, ''),
      sourceKey: dto.sourceKey ?? existing.sourceKey,
    };
    await this.validateConfiguration(principal.organizationId, effective);
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        await tx.integrationConnection.update({
          where: { id: existing.connectionId },
          data: {
            ...(dto.name !== undefined ? { name: `Web-to-Lead: ${dto.name}` } : {}),
            ...(dto.active !== undefined ? { status: dto.active ? 'ACTIVE' : 'DISABLED' } : {}),
          },
        });
        const row = await tx.webToLeadIntegration.update({
          where: { id },
          data: {
            ...(dto.sourceKey !== undefined ? { sourceKey: dto.sourceKey } : {}),
            ...(dto.defaultPipelineId !== undefined
              ? { defaultPipelineId: dto.defaultPipelineId }
              : {}),
            ...(dto.defaultStageId !== undefined ? { defaultStageId: dto.defaultStageId } : {}),
            ...(dto.defaultOwnerId !== undefined || dto.clearDefaultOwner
              ? { defaultOwnerId: dto.clearDefaultOwner ? null : dto.defaultOwnerId }
              : {}),
            ...(dto.defaultPriority !== undefined ? { defaultPriority: dto.defaultPriority } : {}),
            ...(dto.defaultTagIds !== undefined ? { defaultTagIds: dto.defaultTagIds } : {}),
            ...(dto.mappings !== undefined
              ? { mappings: dto.mappings as unknown as Prisma.InputJsonArray }
              : {}),
          },
          include: integrationInclude,
        });
        await tx.activityLog.create({
          data: {
            organizationId: principal.organizationId,
            actorId: principal.userId,
            entityType: 'INTEGRATION',
            entityId: id,
            action:
              dto.active === false
                ? 'WEB_TO_LEAD_INTEGRATION_DISABLED'
                : 'WEB_TO_LEAD_INTEGRATION_UPDATED',
          },
        });
        return row;
      });
      return (await this.decorate([updated]))[0];
    } catch (error) {
      if (this.isUniqueConflict(error))
        throw new ConflictException(
          'A Web-to-Lead integration with this name or source key exists',
        );
      throw error;
    }
  }

  async rotateSecret(principal: AuthenticatedPrincipal, id: string) {
    const integration = await this.requireIntegration(principal.organizationId, id);
    const secret = randomBytes(32).toString('base64url');
    await this.prisma.$transaction(async (tx) => {
      await tx.integrationConnection.update({
        where: { id: integration.connectionId },
        data: {
          encryptedSecret: this.secrets.encrypt(secret),
          secretLastFour: secret.slice(-4),
          secretRotatedAt: new Date(),
        },
      });
      await tx.activityLog.create({
        data: {
          organizationId: principal.organizationId,
          actorId: principal.userId,
          entityType: 'INTEGRATION',
          entityId: id,
          action: 'WEB_TO_LEAD_SECRET_ROTATED',
        },
      });
    });
    return { secret };
  }

  async logs(principal: AuthenticatedPrincipal, id: string) {
    await this.requireIntegration(principal.organizationId, id);
    return this.prisma.webToLeadSubmission.findMany({
      where: { organizationId: principal.organizationId, integrationId: id },
      select: {
        id: true,
        submissionId: true,
        status: true,
        leadId: true,
        receivedAt: true,
        processedAt: true,
        lastError: true,
        event: {
          select: {
            id: true,
            attemptCount: true,
            retryable: true,
            metadata: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async references(principal: AuthenticatedPrincipal) {
    const [pipelines, users, tags, customFields] = await Promise.all([
      this.prisma.pipeline.findMany({
        where: { organizationId: principal.organizationId, entityType: 'LEAD', archivedAt: null },
        select: {
          id: true,
          name: true,
          stages: {
            select: { id: true, name: true, position: true },
            orderBy: { position: 'asc' },
          },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.user.findMany({
        where: { organizationId: principal.organizationId, status: 'ACTIVE' },
        select: { id: true, firstName: true, lastName: true, email: true },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      }),
      this.prisma.tag.findMany({
        where: { organizationId: principal.organizationId },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.customFieldDefinition.findMany({
        where: { organizationId: principal.organizationId, entityType: 'LEAD', active: true },
        select: { id: true, key: true, name: true, fieldType: true, required: true, options: true },
        orderBy: { position: 'asc' },
      }),
    ]);
    return { pipelines, users, tags, customFields };
  }

  async receive(input: SubmissionInput) {
    if (this.production && !input.secure)
      throw new BadRequestException('HTTPS is required for Web-to-Lead submissions');
    if (input.rawBody.length > this.maxPayloadBytes)
      throw new BadRequestException('Web-to-Lead payload is too large');
    await this.rates.consume('web-to-lead', `${input.integrationId}:${input.remoteAddress}`, {
      limit: this.rateLimit,
      windowSeconds: 60,
    });
    const integration = await this.prisma.webToLeadIntegration.findFirst({
      where: {
        id: input.integrationId,
        connection: { status: 'ACTIVE', direction: { in: ['INBOUND', 'BOTH'] } },
      },
      include: { connection: true },
    });
    if (!integration) throw new NotFoundException('Web-to-Lead integration not found');
    this.verifySignature(
      integration.connection.encryptedSecret,
      input.rawBody,
      input.signature,
      input.timestamp,
    );
    const requestDigest = createHash('sha256').update(input.rawBody).digest('hex');
    const candidateIdempotencyKey = input.idempotencyKey?.trim();
    try {
      this.validateRawPayloadShape(input.rawBody);
      if (!candidateIdempotencyKey || candidateIdempotencyKey.length > 160)
        throw new BadRequestException('A valid X-UniCRM-Idempotency-Key header is required');
      if (!input.payload.email && !input.payload.phone)
        throw new BadRequestException('At least one of email or phone is required');
      this.validateCustomPayload(input.payload.custom);
    } catch (error) {
      if (error instanceof HttpException)
        await this.recordRejectedSubmission(
          integration,
          candidateIdempotencyKey,
          requestDigest,
          input.payload.submissionId,
          String(error.message).slice(0, 1000),
        );
      throw error;
    }
    const idempotencyKey = candidateIdempotencyKey;
    let eventId: string;
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const event = await tx.integrationEvent.create({
          data: {
            organizationId: integration.organizationId,
            connectionId: integration.connectionId,
            direction: 'INBOUND',
            externalEventId: idempotencyKey,
            eventType: WEB_TO_LEAD_EVENT_TYPE,
            status: 'RECEIVED',
            retryable: true,
            receivedAt: new Date(),
            payload: input.payload as unknown as Prisma.InputJsonObject,
            metadata: {
              sourceKey: integration.sourceKey,
              submissionId: input.payload.submissionId ?? idempotencyKey,
              requestDigest,
            },
          },
        });
        await tx.webToLeadSubmission.create({
          data: {
            organizationId: integration.organizationId,
            integrationId: integration.id,
            eventId: event.id,
            idempotencyKey,
            requestDigest,
            submissionId: input.payload.submissionId,
          },
        });
        await tx.integrationConnection.update({
          where: { id: integration.connectionId },
          data: { lastActivityAt: new Date() },
        });
        await tx.webToLeadIntegration.update({
          where: { id: integration.id },
          data: { lastSubmissionAt: new Date() },
        });
        return event;
      });
      eventId = result.id;
    } catch (error) {
      if (!this.isUniqueConflict(error)) throw error;
      const duplicate = await this.prisma.webToLeadSubmission.findFirst({
        where: {
          integrationId: integration.id,
          OR: [
            { idempotencyKey },
            ...(input.payload.submissionId ? [{ submissionId: input.payload.submissionId }] : []),
          ],
        },
        select: {
          eventId: true,
          status: true,
          lastError: true,
          event: { select: { metadata: true, retryable: true } },
        },
      });
      if (duplicate?.status === 'FAILED' && !duplicate.event.retryable)
        throw new ConflictException(
          duplicate.lastError ?? 'This submission was previously rejected',
        );
      if (duplicate) {
        const metadata =
          duplicate.event.metadata &&
          typeof duplicate.event.metadata === 'object' &&
          !Array.isArray(duplicate.event.metadata)
            ? duplicate.event.metadata
            : {};
        const duplicateCount =
          'duplicateCount' in metadata && typeof metadata.duplicateCount === 'number'
            ? metadata.duplicateCount + 1
            : 1;
        await this.prisma.integrationEvent.update({
          where: { id: duplicate.eventId },
          data: {
            metadata: {
              ...metadata,
              duplicateCount,
              lastDuplicateAt: new Date().toISOString(),
            },
          },
        });
      }
      return {
        accepted: true,
        duplicate: true,
        eventId: duplicate?.eventId,
        submissionId: input.payload.submissionId ?? idempotencyKey,
      };
    }
    try {
      await this.jobs.enqueueIntegrationEvent(eventId);
    } catch (error) {
      await this.prisma.$transaction([
        this.prisma.integrationEvent.update({
          where: { id: eventId },
          data: { status: 'FAILED', retryable: true, lastError: 'Queue unavailable' },
        }),
        this.prisma.webToLeadSubmission.update({
          where: { eventId },
          data: { status: 'FAILED', lastError: 'Queue unavailable' },
        }),
      ]);
      throw error;
    }
    return {
      accepted: true,
      duplicate: false,
      eventId,
      submissionId: input.payload.submissionId ?? idempotencyKey,
    };
  }

  async test(principal: AuthenticatedPrincipal, id: string, payload: WebToLeadPayloadDto) {
    const integration = await this.requireIntegration(principal.organizationId, id);
    const rawBody = Buffer.from(JSON.stringify(payload));
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const secret = this.secrets.decrypt(integration.connection.encryptedSecret);
    const signature = createHmac('sha256', secret)
      .update(`${timestamp}.`)
      .update(rawBody)
      .digest('hex');
    const result = await this.receive({
      integrationId: id,
      payload,
      rawBody,
      signature,
      timestamp,
      idempotencyKey: `test-${randomBytes(18).toString('hex')}`,
      remoteAddress: `user:${principal.userId}`,
      secure: true,
    });
    if (result.eventId) await this.processEvent(result.eventId);
    return { accepted: true, submissionId: payload.submissionId };
  }

  async processEvent(eventId: string): Promise<boolean> {
    const event = await this.prisma.integrationEvent.findUnique({
      where: { id: eventId },
      include: { webToLeadSubmission: { include: { integration: true } } },
    });
    if (!event?.webToLeadSubmission || event.eventType !== WEB_TO_LEAD_EVENT_TYPE) return false;
    if (event.status === 'PROCESSED' || event.status === 'IGNORED') return true;
    if (!['RECEIVED', 'FAILED'].includes(event.status)) return true;
    const claimed = await this.prisma.integrationEvent.updateMany({
      where: { id: eventId, status: event.status, attemptCount: event.attemptCount },
      data: { status: 'PROCESSING', attemptCount: { increment: 1 }, lastError: null },
    });
    if (claimed.count !== 1) return true;
    await this.prisma.webToLeadSubmission.update({
      where: { eventId },
      data: { status: 'PROCESSING', lastError: null },
    });
    try {
      if (event.webToLeadSubmission.leadId) {
        const existingLead = await this.prisma.lead.findFirstOrThrow({
          where: { id: event.webToLeadSubmission.leadId, organizationId: event.organizationId },
        });
        await this.publishLeadCreated(event.id, existingLead);
        await this.prisma.$transaction([
          this.prisma.integrationEvent.update({
            where: { id: event.id },
            data: {
              status: 'PROCESSED',
              retryable: false,
              processedAt: new Date(),
              lastError: null,
            },
          }),
          this.prisma.webToLeadSubmission.update({
            where: { eventId: event.id },
            data: { status: 'ACCEPTED', processedAt: new Date(), lastError: null },
          }),
        ]);
        return true;
      }
      const payload = event.payload as unknown as WebToLeadPayloadDto;
      const integration = event.webToLeadSubmission.integration;
      const configuration = await this.validatedStoredConfiguration(integration);
      const mapped = this.mapPayload(payload, configuration.mappings);
      this.validateMappedLead(mapped.lead);
      const customFieldValues = await this.customFieldsById(
        event.organizationId,
        mapped.customFields,
      );
      const result = await this.prisma.$transaction(async (tx) => {
        let companyId: string | undefined;
        if (mapped.lead.company) {
          const existingCompany = await tx.company.findFirst({
            where: {
              organizationId: event.organizationId,
              archivedAt: null,
              name: { equals: mapped.lead.company, mode: 'insensitive' },
            },
          });
          companyId = existingCompany?.id;
          if (!companyId) {
            companyId = (
              await tx.company.create({
                data: {
                  organizationId: event.organizationId,
                  name: mapped.lead.company,
                  status: 'PROSPECT',
                },
              })
            ).id;
          }
        }
        const normalizedEmail = mapped.lead.email?.trim().toLowerCase();
        const normalizedPhone = this.normalizePhone(mapped.lead.phone);
        let contact = await tx.contact.findFirst({
          where: {
            organizationId: event.organizationId,
            archivedAt: null,
            OR: [
              ...(normalizedEmail ? [{ normalizedEmail }] : []),
              ...(!normalizedEmail && normalizedPhone ? [{ phone: normalizedPhone }] : []),
            ],
          },
        });
        if (!contact) {
          const names = this.contactNames(mapped.lead);
          contact = await tx.contact.create({
            data: {
              organizationId: event.organizationId,
              companyId,
              firstName: names.firstName,
              lastName: names.lastName,
              email: mapped.lead.email,
              normalizedEmail,
              phone: normalizedPhone,
            },
          });
        } else if (!contact.companyId && companyId) {
          contact = await tx.contact.update({ where: { id: contact.id }, data: { companyId } });
        }
        const lead = await tx.lead.create({
          data: {
            organizationId: event.organizationId,
            companyId,
            contactId: contact.id,
            title: mapped.lead.title ?? this.defaultTitle(mapped.lead),
            firstName: mapped.lead.firstName,
            lastName: mapped.lead.lastName,
            email: mapped.lead.email,
            normalizedEmail,
            phone: normalizedPhone,
            source: 'WEBSITE',
            pipelineId: integration.defaultPipelineId,
            stageId: integration.defaultStageId,
            estimatedValue: mapped.lead.estimatedValue,
            ownerId: integration.defaultOwnerId,
            priority: mapped.lead.priority ?? integration.defaultPriority,
            description: mapped.lead.description,
          },
        });
        await this.customFields.saveValues(
          tx,
          event.organizationId,
          'LEAD',
          lead.id,
          customFieldValues,
          true,
        );
        await this.tags.sync(tx, event.organizationId, 'LEAD', lead.id, [
          ...new Set([...integration.defaultTagIds, ...mapped.tagIds]),
        ]);
        await tx.leadActivity.create({
          data: {
            organizationId: event.organizationId,
            leadId: lead.id,
            type: 'SYSTEM',
            title: 'Lead created from website form',
            metadata: {
              integrationId: integration.id,
              sourceKey: integration.sourceKey,
              submissionId: payload.submissionId,
              integrationEventId: event.id,
            },
          },
        });
        await tx.activityLog.create({
          data: {
            organizationId: event.organizationId,
            actorId: null,
            entityType: 'LEAD',
            entityId: lead.id,
            action: 'WEB_TO_LEAD_CREATED',
            metadata: {
              integrationId: integration.id,
              sourceKey: integration.sourceKey,
              submissionId: payload.submissionId,
              integrationEventId: event.id,
            },
          },
        });
        await tx.integrationEvent.update({
          where: { id: event.id },
          data: {
            status: 'PROCESSED',
            retryable: false,
            processedAt: new Date(),
            lastError: null,
            metadata: {
              sourceKey: integration.sourceKey,
              submissionId: payload.submissionId,
              outcome: 'lead_created',
              leadId: lead.id,
            },
          },
        });
        await tx.webToLeadSubmission.update({
          where: { eventId: event.id },
          data: { status: 'ACCEPTED', leadId: lead.id, processedAt: new Date(), lastError: null },
        });
        await tx.webToLeadIntegration.update({
          where: { id: integration.id },
          data: { successfulSubmissions: { increment: 1 } },
        });
        return lead;
      });
      await this.publishLeadCreated(event.id, result);
      return true;
    } catch (error) {
      const retryable = !(error instanceof HttpException);
      const message = this.safeProcessingError(error);
      const committed = await this.prisma.webToLeadSubmission.findUnique({
        where: { eventId: event.id },
        select: { leadId: true },
      });
      if (committed?.leadId) {
        await this.prisma.$transaction([
          this.prisma.integrationEvent.update({
            where: { id: event.id },
            data: { status: 'FAILED', retryable: true, lastError: 'Automation dispatch failed' },
          }),
          this.prisma.webToLeadSubmission.update({
            where: { eventId: event.id },
            data: { status: 'PROCESSING', lastError: 'Automation dispatch pending retry' },
          }),
        ]);
        this.logger.warn(`Web-to-Lead automation dispatch failed eventId=${event.id}`);
        throw error;
      }
      await this.prisma.$transaction([
        this.prisma.integrationEvent.update({
          where: { id: event.id },
          data: {
            status: 'FAILED',
            retryable,
            lastError: message,
            metadata: {
              sourceKey: event.webToLeadSubmission.integration.sourceKey,
              submissionId: event.webToLeadSubmission.submissionId,
              requestDigest: event.webToLeadSubmission.requestDigest,
              outcome: 'lead_failed',
            },
          },
        }),
        this.prisma.webToLeadSubmission.update({
          where: { eventId: event.id },
          data: { status: 'FAILED', lastError: message },
        }),
        this.prisma.webToLeadIntegration.update({
          where: { id: event.webToLeadSubmission.integrationId },
          data: { failedSubmissions: { increment: 1 } },
        }),
      ]);
      this.logger.warn(`Web-to-Lead processing failed eventId=${event.id} reason=${message}`);
      if (retryable) throw error;
      return true;
    }
  }

  private async decorate<T extends { defaultTagIds: string[] }>(rows: T[]) {
    const ids = [...new Set(rows.flatMap((row) => row.defaultTagIds))];
    const tags = ids.length
      ? await this.prisma.tag.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true },
        })
      : [];
    const byId = new Map(tags.map((tag) => [tag.id, tag]));
    return rows.map((row) => {
      const typed = row as T & {
        connection: { encryptedSecret: string; status: string } & Record<string, unknown>;
        id: string;
      };
      const safeConnection: Record<string, unknown> & { encryptedSecret?: string } = {
        ...typed.connection,
      };
      delete safeConnection.encryptedSecret;
      return {
        ...row,
        connection: safeConnection,
        active: typed.connection.status === 'ACTIVE',
        endpoint: `/api/v1/inbound/web-to-lead/${typed.id}`,
        defaultTags: row.defaultTagIds.flatMap((id) => (byId.has(id) ? [byId.get(id)] : [])),
      };
    });
  }

  private requireIntegration(organizationId: string, id: string) {
    return this.prisma.webToLeadIntegration
      .findFirst({ where: { id, organizationId }, include: integrationInclude })
      .then((row) => {
        if (!row) throw new NotFoundException('Web-to-Lead integration not found');
        return row;
      });
  }

  private async validateConfiguration(
    organizationId: string,
    config: {
      defaultPipelineId: string;
      defaultStageId: string;
      defaultOwnerId?: string;
      defaultTagIds?: string[];
      mappings: WebToLeadMappingDto[];
    },
  ) {
    const [pipeline, stage, ownerCount, tagCount, customFields] = await Promise.all([
      this.prisma.pipeline.findFirst({
        where: {
          id: config.defaultPipelineId,
          organizationId,
          entityType: 'LEAD',
          archivedAt: null,
        },
      }),
      this.prisma.pipelineStage.findFirst({
        where: { id: config.defaultStageId, organizationId, pipelineId: config.defaultPipelineId },
      }),
      config.defaultOwnerId
        ? this.prisma.user.count({
            where: { id: config.defaultOwnerId, organizationId, status: 'ACTIVE' },
          })
        : Promise.resolve(1),
      this.prisma.tag.count({ where: { organizationId, id: { in: config.defaultTagIds ?? [] } } }),
      this.prisma.customFieldDefinition.findMany({
        where: { organizationId, entityType: 'LEAD', active: true },
        select: { id: true },
      }),
    ]);
    if (!pipeline || !stage)
      throw new BadRequestException('Default Lead pipeline or stage is invalid');
    if (!ownerCount) throw new BadRequestException('Default owner is invalid');
    if (tagCount !== new Set(config.defaultTagIds ?? []).size)
      throw new BadRequestException('One or more default tags are invalid');
    const customIds = new Set(customFields.map(({ id }) => id));
    const seenTargets = new Set<string>();
    for (const mapping of config.mappings) {
      if (!WEB_TO_LEAD_MAPPING_TARGETS.includes(mapping.target))
        throw new BadRequestException('Unsupported Web-to-Lead mapping target');
      const hasSource = mapping.sourceField !== undefined;
      const hasFixed = mapping.fixedValue !== undefined;
      if (hasSource === hasFixed)
        throw new BadRequestException('Each mapping must define exactly one source or fixed value');
      if (
        mapping.target === 'LEAD_CUSTOM_FIELD' &&
        (!mapping.targetId || !customIds.has(mapping.targetId))
      )
        throw new BadRequestException('Custom-field mapping target is invalid');
      if (mapping.target === 'LEAD_TAG') {
        if (!mapping.targetId) throw new BadRequestException('Tag mapping target is required');
        const exists = await this.prisma.tag.count({
          where: { id: mapping.targetId, organizationId },
        });
        if (!exists) throw new BadRequestException('Tag mapping target is invalid');
      }
      const key = `${mapping.target}:${mapping.targetId ?? ''}`;
      if (seenTargets.has(key)) throw new BadRequestException('Duplicate mapping target');
      seenTargets.add(key);
    }
  }

  private async validatedStoredConfiguration(integration: {
    organizationId: string;
    defaultPipelineId: string;
    defaultStageId: string;
    defaultOwnerId: string | null;
    defaultPriority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
    defaultTagIds: string[];
    mappings: unknown;
  }) {
    const mappings = integration.mappings as WebToLeadMappingDto[];
    await this.validateConfiguration(integration.organizationId, {
      ...integration,
      defaultOwnerId: integration.defaultOwnerId ?? undefined,
      mappings,
    });
    return { mappings };
  }

  private mapPayload(payload: WebToLeadPayloadDto, mappings: WebToLeadMappingDto[]) {
    const lead: LeadDraft = {
      company: payload.company,
      description: payload.message,
      email: payload.email,
      estimatedValue: payload.estimatedValue,
      firstName: payload.firstName,
      fullName: payload.fullName ?? payload.name,
      lastName: payload.lastName,
      phone: payload.phone,
      priority: payload.priority,
      service: payload.service,
      title: payload.subject,
    };
    const customFields: Record<string, unknown> = {};
    const tagIds: string[] = [];
    for (const mapping of mappings) {
      const value = mapping.sourceField
        ? this.sourceValue(payload, mapping.sourceField)
        : mapping.fixedValue;
      if (value === undefined || value === null || value === '') continue;
      if (mapping.target === 'LEAD_TAG') {
        if (mapping.targetId && Boolean(value)) tagIds.push(mapping.targetId);
        continue;
      }
      if (mapping.target === 'LEAD_CUSTOM_FIELD') {
        if (mapping.targetId) customFields[mapping.targetId] = value;
        continue;
      }
      const text =
        typeof value === 'string'
          ? value.trim()
          : typeof value === 'number' || typeof value === 'boolean'
            ? String(value)
            : '';
      if (!text) continue;
      if (mapping.target === 'CONTACT_FULL_NAME') lead.fullName = text;
      else if (mapping.target === 'CONTACT_FIRST_NAME') lead.firstName = text;
      else if (mapping.target === 'CONTACT_LAST_NAME') lead.lastName = text;
      else if (mapping.target === 'CONTACT_EMAIL' || mapping.target === 'LEAD_EMAIL')
        lead.email = text;
      else if (mapping.target === 'CONTACT_PHONE' || mapping.target === 'LEAD_PHONE')
        lead.phone = text;
      else if (mapping.target === 'COMPANY_NAME') lead.company = text;
      else if (mapping.target === 'LEAD_TITLE') lead.title = text;
      else if (mapping.target === 'LEAD_DESCRIPTION') lead.description = text;
      else if (mapping.target === 'LEAD_ESTIMATED_VALUE') lead.estimatedValue = Number(value);
      else if (mapping.target === 'LEAD_PRIORITY')
        lead.priority = text.toUpperCase() as LeadDraft['priority'];
    }
    return { lead, customFields, tagIds };
  }

  private sourceValue(payload: WebToLeadPayloadDto, field: string) {
    if (field.startsWith('custom.')) return payload.custom?.[field.slice(7)];
    return (payload as unknown as Record<string, unknown>)[field];
  }

  private async customFieldsById(organizationId: string, values: Record<string, unknown>) {
    const ids = Object.keys(values);
    if (!ids.length) return {};
    const definitions = await this.prisma.customFieldDefinition.findMany({
      where: { organizationId, entityType: 'LEAD', active: true, id: { in: ids } },
      select: { id: true, key: true },
    });
    if (definitions.length !== ids.length)
      throw new BadRequestException('Custom-field mapping is invalid');
    return Object.fromEntries(definitions.map(({ id, key }) => [key, values[id]]));
  }

  private contactNames(lead: LeadDraft) {
    if (lead.firstName || lead.lastName)
      return { firstName: lead.firstName || 'Website', lastName: lead.lastName || 'Lead' };
    const parts = lead.fullName?.split(/\s+/).filter(Boolean) ?? [];
    if (parts.length > 1) return { firstName: parts.shift()!, lastName: parts.join(' ') };
    if (parts.length === 1) return { firstName: parts[0]!, lastName: 'Lead' };
    const local = lead.email?.split('@')[0];
    return { firstName: local || 'Website', lastName: 'Lead' };
  }

  private defaultTitle(lead: LeadDraft) {
    if (lead.company && lead.service) return `${lead.company} – ${lead.service}`;
    if (lead.company) return `${lead.company} website inquiry`;
    const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.fullName;
    return name ? `${name} website inquiry` : 'Website inquiry';
  }

  private publishLeadCreated(
    triggerEventId: string,
    lead: {
      id: string;
      organizationId: string;
      title: string;
      stageId: string;
      ownerId: string | null;
      priority: string;
      source: string | null;
    },
  ) {
    return this.automations.publishBusinessEvent(
      lead.organizationId,
      'lead.created',
      lead.id,
      {
        title: lead.title,
        stageId: lead.stageId,
        ownerId: lead.ownerId,
        priority: lead.priority,
        source: lead.source,
      },
      { triggerEventId },
    );
  }

  private normalizePhone(phone?: string) {
    if (!phone) return undefined;
    const trimmed = phone.trim();
    const prefix = trimmed.startsWith('+') ? '+' : '';
    const digits = trimmed.replace(/\D/g, '');
    return digits ? `${prefix}${digits}` : undefined;
  }

  private validateMappedLead(lead: LeadDraft) {
    if (!lead.email && !lead.phone)
      throw new BadRequestException('Mapped submission must include an email or phone');
    if (lead.email && !isEmail(lead.email))
      throw new BadRequestException('Mapped email address is invalid');
    if (lead.phone && !this.normalizePhone(lead.phone))
      throw new BadRequestException('Mapped phone number is invalid');
    if (lead.priority && !(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const).includes(lead.priority))
      throw new BadRequestException('Mapped Lead priority is invalid');
    if (
      lead.estimatedValue !== undefined &&
      (!Number.isFinite(lead.estimatedValue) || lead.estimatedValue < 0)
    )
      throw new BadRequestException('Mapped estimated value is invalid');
  }

  private verifySignature(
    encryptedSecret: string,
    rawBody: Buffer,
    signature?: string,
    timestamp?: string,
  ) {
    if (!signature || !timestamp) throw new UnauthorizedException('Webhook signature is required');
    if (!/^\d{10,13}$/.test(timestamp))
      throw new UnauthorizedException('Invalid webhook timestamp');
    const numeric = Number(timestamp);
    const milliseconds = timestamp.length === 13 ? numeric : numeric * 1000;
    if (
      !Number.isSafeInteger(numeric) ||
      Math.abs(Date.now() - milliseconds) > this.timestampToleranceSeconds * 1000
    )
      throw new UnauthorizedException('Webhook timestamp is outside the allowed tolerance');
    const secret = this.secrets.decrypt(encryptedSecret);
    const expected = createHmac('sha256', secret)
      .update(`${timestamp}.`)
      .update(rawBody)
      .digest('hex');
    const supplied = signature.replace(/^sha256=/i, '').toLowerCase();
    const valid =
      /^[a-f0-9]{64}$/.test(supplied) &&
      timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(supplied, 'hex'));
    if (!valid) throw new UnauthorizedException('Invalid webhook signature');
  }

  private validateCustomPayload(custom?: Record<string, unknown>) {
    if (!custom) return;
    const entries = Object.entries(custom);
    if (entries.length > 50) throw new BadRequestException('Too many custom payload fields');
    for (const [key, value] of entries) {
      if (!/^[a-zA-Z0-9_-]{1,80}$/.test(key))
        throw new BadRequestException('Invalid custom payload field');
      if (/(password|secret|token|authorization|cookie)/i.test(key))
        throw new BadRequestException(`Sensitive custom payload field is not allowed: ${key}`);
      if (
        value !== null &&
        !['string', 'number', 'boolean'].includes(typeof value) &&
        !Array.isArray(value)
      )
        throw new BadRequestException(`Unsupported custom payload value: ${key}`);
      const values = Array.isArray(value) ? value : [value];
      if (values.length > 50)
        throw new BadRequestException(`Too many values in custom payload field: ${key}`);
      if (
        values.some(
          (item) =>
            item !== null &&
            (!['string', 'number', 'boolean'].includes(typeof item) ||
              (typeof item === 'string' && item.length > 10_000) ||
              (typeof item === 'number' && !Number.isFinite(item))),
        )
      )
        throw new BadRequestException(`Invalid custom payload value: ${key}`);
    }
  }

  private validateRawPayloadShape(rawBody: Buffer) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody.toString('utf8')) as unknown;
    } catch {
      throw new BadRequestException('Web-to-Lead payload must be valid JSON');
    }
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object')
      throw new BadRequestException('Web-to-Lead payload must be a JSON object');
    const unknown = Object.keys(parsed).find((key) => !WEB_TO_LEAD_PAYLOAD_FIELDS.has(key));
    if (unknown) throw new BadRequestException(`Unknown Web-to-Lead field: ${unknown}`);
  }

  private async recordRejectedSubmission(
    integration: {
      id: string;
      organizationId: string;
      connectionId: string;
      sourceKey: string;
    },
    idempotencyKey: string | undefined,
    requestDigest: string,
    submissionId: string | undefined,
    lastError: string,
  ) {
    const safeKey =
      idempotencyKey && idempotencyKey.length <= 160 ? idempotencyKey : `rejected-${requestDigest}`;
    try {
      await this.prisma.$transaction(async (tx) => {
        const event = await tx.integrationEvent.create({
          data: {
            organizationId: integration.organizationId,
            connectionId: integration.connectionId,
            direction: 'INBOUND',
            externalEventId: safeKey,
            eventType: WEB_TO_LEAD_EVENT_TYPE,
            status: 'IGNORED',
            retryable: false,
            receivedAt: new Date(),
            processedAt: new Date(),
            lastError,
            metadata: {
              sourceKey: integration.sourceKey,
              submissionId: submissionId ?? safeKey,
              requestDigest,
              outcome: 'validation_failed',
            },
          },
        });
        await tx.webToLeadSubmission.create({
          data: {
            organizationId: integration.organizationId,
            integrationId: integration.id,
            eventId: event.id,
            idempotencyKey: safeKey,
            requestDigest,
            submissionId,
            status: 'FAILED',
            processedAt: new Date(),
            lastError,
          },
        });
        await tx.integrationConnection.update({
          where: { id: integration.connectionId },
          data: { lastActivityAt: new Date() },
        });
        await tx.webToLeadIntegration.update({
          where: { id: integration.id },
          data: {
            lastSubmissionAt: new Date(),
            failedSubmissions: { increment: 1 },
          },
        });
      });
    } catch (error) {
      if (!this.isUniqueConflict(error))
        this.logger.warn(
          `Could not persist rejected Web-to-Lead event integrationId=${integration.id}`,
        );
    }
  }

  private safeProcessingError(error: unknown) {
    if (error instanceof HttpException) return String(error.message).slice(0, 1000);
    return 'Web-to-Lead processing failed';
  }

  private isUniqueConflict(error: unknown) {
    return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
  }
}
