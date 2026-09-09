import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Prisma } from '../generated/prisma/client';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import { RateLimitService } from '../auth/rate-limit.service';
import { AuditService } from '../audit/audit.service';
import type { EnvironmentVariables } from '../config/environment';
import { PrismaService } from '../database/prisma.service';
import { JobsService } from '../jobs/jobs.service';
import { SUPPORTED_WEBHOOK_EVENTS } from './integration.constants';
import { IntegrationSecretService } from './integration-secret.service';
import { WebhookUrlService } from './webhook-url.service';
import type {
  CreateExternalMappingDto,
  CreateIntegrationConnectionDto,
  CreateWebhookSubscriptionDto,
  InboundWebhookDto,
  RotateIntegrationSecretDto,
  UpdateIntegrationConnectionDto,
  UpdateWebhookSubscriptionDto,
} from './dto/integrations.dto';

const connectionSelect = {
  id: true,
  name: true,
  provider: true,
  status: true,
  direction: true,
  configuration: true,
  secretLastFour: true,
  secretRotatedAt: true,
  lastActivityAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const subscriptionSelect = {
  id: true,
  connectionId: true,
  name: true,
  targetUrl: true,
  secretLastFour: true,
  active: true,
  eventTypes: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);
  private readonly maxPayloadBytes: number;
  private readonly timestampToleranceSeconds: number;
  private readonly timeoutMs: number;
  private readonly rateLimit: number;

  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ConfigService) config: ConfigService<EnvironmentVariables, true>,
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RateLimitService) private readonly rates: RateLimitService,
    @Inject(IntegrationSecretService) private readonly secrets: IntegrationSecretService,
    @Inject(WebhookUrlService) private readonly urls: WebhookUrlService,
  ) {
    this.maxPayloadBytes = config.get('INTEGRATION_WEBHOOK_MAX_BYTES', { infer: true });
    this.timestampToleranceSeconds = config.get('INTEGRATION_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS', {
      infer: true,
    });
    this.timeoutMs = config.get('INTEGRATION_WEBHOOK_TIMEOUT_MS', { infer: true });
    this.rateLimit = config.get('INTEGRATION_WEBHOOK_RATE_LIMIT_MAX', { infer: true });
  }

  listConnections(principal: AuthenticatedPrincipal) {
    return this.prisma.integrationConnection.findMany({
      where: { organizationId: principal.organizationId },
      select: connectionSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async createConnection(principal: AuthenticatedPrincipal, dto: CreateIntegrationConnectionDto) {
    this.validateConfiguration(dto.configuration);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const connection = await tx.integrationConnection.create({
          data: {
            organizationId: principal.organizationId,
            name: dto.name,
            provider: dto.provider,
            direction: dto.direction,
            configuration: dto.configuration as Prisma.InputJsonObject | undefined,
            encryptedSecret: this.secrets.encrypt(dto.secret),
            secretLastFour: dto.secret.slice(-4),
          },
          select: connectionSelect,
        });
        await this.audit.create(
          {
            action: 'INTEGRATION_CREATED',
            actorId: principal.userId,
            entityId: connection.id,
            entityType: 'INTEGRATION',
            organizationId: principal.organizationId,
            metadata: { provider: dto.provider, direction: dto.direction },
          },
          tx,
        );
        return connection;
      });
    } catch (error) {
      if (this.isUniqueConflict(error))
        throw new ConflictException('An integration connection with this name already exists');
      throw error;
    }
  }

  async updateConnection(
    principal: AuthenticatedPrincipal,
    id: string,
    dto: UpdateIntegrationConnectionDto,
  ) {
    await this.requireConnection(principal.organizationId, id);
    this.validateConfiguration(dto.configuration);
    const updated = await this.prisma.integrationConnection.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.direction !== undefined ? { direction: dto.direction } : {}),
        ...(dto.configuration !== undefined
          ? { configuration: dto.configuration as Prisma.InputJsonObject }
          : {}),
      },
      select: connectionSelect,
    });
    if (dto.status === 'DISABLED')
      await this.audit.create({
        action: 'INTEGRATION_DISABLED',
        actorId: principal.userId,
        entityId: id,
        entityType: 'INTEGRATION',
        organizationId: principal.organizationId,
      });
    return updated;
  }

  async rotateSecret(
    principal: AuthenticatedPrincipal,
    id: string,
    dto: RotateIntegrationSecretDto,
  ) {
    await this.requireConnection(principal.organizationId, id);
    const connection = await this.prisma.$transaction(async (tx) => {
      const result = await tx.integrationConnection.update({
        where: { id },
        data: {
          encryptedSecret: this.secrets.encrypt(dto.secret),
          secretLastFour: dto.secret.slice(-4),
          secretRotatedAt: new Date(),
        },
        select: connectionSelect,
      });
      await this.audit.create(
        {
          action: 'INTEGRATION_SECRET_ROTATED',
          actorId: principal.userId,
          entityId: id,
          entityType: 'INTEGRATION',
          organizationId: principal.organizationId,
        },
        tx,
      );
      return result;
    });
    return connection;
  }

  async receiveInbound(input: {
    connectionId: string;
    dto: InboundWebhookDto;
    rawBody: Buffer;
    signature?: string;
    timestamp?: string;
    delivery?: string;
    event?: string;
    remoteAddress: string;
  }) {
    if (input.rawBody.length > this.maxPayloadBytes)
      throw new BadRequestException('Webhook payload is too large');
    await this.rates.consume(
      'integration-webhook',
      `${input.connectionId}:${input.remoteAddress}`,
      { limit: this.rateLimit, windowSeconds: 60 },
    );
    const connection = await this.prisma.integrationConnection.findFirst({
      where: { id: input.connectionId, status: 'ACTIVE', direction: { in: ['INBOUND', 'BOTH'] } },
    });
    if (!connection) throw new NotFoundException('Integration connection not found');
    this.verifyInbound(connection.encryptedSecret, input.rawBody, input.signature, input.timestamp);
    if (input.event && input.event !== input.dto.eventType)
      throw new BadRequestException('Webhook event header does not match payload');
    if (input.delivery && input.delivery !== input.dto.eventId)
      throw new BadRequestException('Webhook delivery header does not match payload');
    let event;
    try {
      event = await this.prisma.integrationEvent.create({
        data: {
          organizationId: connection.organizationId,
          connectionId: connection.id,
          direction: 'INBOUND',
          externalEventId: input.dto.eventId,
          eventType: input.dto.eventType,
          status: 'RECEIVED',
          retryable: true,
          receivedAt: new Date(),
          payload: this.redactPayload(input.dto.data) as Prisma.InputJsonObject,
          metadata: { occurredAt: input.dto.occurredAt },
        },
      });
    } catch (error) {
      if (this.isUniqueConflict(error)) return { duplicate: true, accepted: true };
      throw error;
    }
    await this.prisma.integrationConnection.update({
      where: { id: connection.id },
      data: { lastActivityAt: new Date() },
    });
    try {
      await this.jobs.enqueueIntegrationEvent(event.id);
    } catch (error) {
      await this.prisma.integrationEvent.update({
        where: { id: event.id },
        data: { status: 'FAILED', retryable: true, lastError: 'Queue unavailable' },
      });
      throw error;
    }
    return { accepted: true, duplicate: false, eventId: event.id };
  }

  listEvents(principal: AuthenticatedPrincipal, status?: string) {
    return this.prisma.integrationEvent.findMany({
      where: {
        organizationId: principal.organizationId,
        ...(status ? { status: status as never } : {}),
      },
      select: {
        id: true,
        connectionId: true,
        direction: true,
        externalEventId: true,
        eventType: true,
        status: true,
        attemptCount: true,
        retryable: true,
        receivedAt: true,
        processedAt: true,
        lastError: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async retryEvent(principal: AuthenticatedPrincipal, id: string) {
    const event = await this.prisma.integrationEvent.findFirst({
      where: { id, organizationId: principal.organizationId },
    });
    if (!event) throw new NotFoundException('Integration event not found');
    if (event.status !== 'FAILED' || !event.retryable)
      throw new ConflictException('Integration event is not retryable');
    await this.prisma.integrationEvent.update({
      where: { id },
      data: { status: 'RECEIVED', lastError: null },
    });
    await this.jobs.enqueueIntegrationEvent(id);
    await this.audit.create({
      action: 'INTEGRATION_EVENT_RETRIED',
      actorId: principal.userId,
      entityId: id,
      entityType: 'INTEGRATION_EVENT',
      organizationId: principal.organizationId,
    });
    return { accepted: true };
  }

  async processInboundEvent(eventId: string) {
    const event = await this.prisma.integrationEvent.findUnique({ where: { id: eventId } });
    if (!event || event.direction !== 'INBOUND' || !['RECEIVED', 'FAILED'].includes(event.status))
      return;
    const claimed = await this.prisma.integrationEvent.updateMany({
      where: { id: eventId, status: event.status, attemptCount: event.attemptCount },
      data: { status: 'PROCESSING', attemptCount: { increment: 1 } },
    });
    if (claimed.count !== 1) return;
    try {
      await this.prisma.integrationEvent.update({
        where: { id: eventId },
        data: { status: 'PROCESSED', retryable: false, processedAt: new Date(), lastError: null },
      });
    } catch (error) {
      await this.prisma.integrationEvent.update({
        where: { id: eventId },
        data: {
          status: 'FAILED',
          retryable: event.attemptCount + 1 < 5,
          lastError: (error instanceof Error
            ? error.message
            : 'Integration processing failed'
          ).slice(0, 1000),
        },
      });
      throw error;
    }
  }

  listSubscriptions(principal: AuthenticatedPrincipal) {
    return this.prisma.webhookSubscription.findMany({
      where: { organizationId: principal.organizationId },
      select: subscriptionSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async createSubscription(principal: AuthenticatedPrincipal, dto: CreateWebhookSubscriptionDto) {
    const connection = await this.requireConnection(principal.organizationId, dto.connectionId);
    if (connection.direction === 'INBOUND')
      throw new BadRequestException('Connection does not allow outbound webhooks');
    this.validateEventTypes(dto.eventTypes);
    await this.urls.validate(dto.targetUrl);
    const subscription = await this.prisma.webhookSubscription
      .create({
        data: {
          organizationId: principal.organizationId,
          connectionId: dto.connectionId,
          name: dto.name,
          targetUrl: dto.targetUrl,
          encryptedSecret: this.secrets.encrypt(dto.secret),
          secretLastFour: dto.secret.slice(-4),
          eventTypes: dto.eventTypes,
        },
        select: subscriptionSelect,
      })
      .catch((error: unknown) => {
        if (this.isUniqueConflict(error))
          throw new ConflictException('A webhook subscription with this name already exists');
        throw error;
      });
    await this.audit.create({
      action: 'WEBHOOK_CREATED',
      actorId: principal.userId,
      entityId: subscription.id,
      entityType: 'WEBHOOK',
      organizationId: principal.organizationId,
    });
    return subscription;
  }

  async updateSubscription(
    principal: AuthenticatedPrincipal,
    id: string,
    dto: UpdateWebhookSubscriptionDto,
  ) {
    const existing = await this.requireSubscription(principal.organizationId, id);
    if (dto.eventTypes) this.validateEventTypes(dto.eventTypes);
    if (dto.targetUrl) await this.urls.validate(dto.targetUrl);
    const subscription = await this.prisma.webhookSubscription.update({
      where: { id },
      data: dto,
      select: subscriptionSelect,
    });
    await this.audit.create({
      action: dto.active === false && existing.active ? 'WEBHOOK_DISABLED' : 'WEBHOOK_UPDATED',
      actorId: principal.userId,
      entityId: id,
      entityType: 'WEBHOOK',
      organizationId: principal.organizationId,
    });
    return subscription;
  }

  listDeliveries(principal: AuthenticatedPrincipal) {
    return this.prisma.webhookDelivery.findMany({
      where: { organizationId: principal.organizationId },
      select: {
        id: true,
        subscriptionId: true,
        eventId: true,
        eventType: true,
        attempt: true,
        statusCode: true,
        status: true,
        retryable: true,
        lastError: true,
        createdAt: true,
        deliveredAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async retryDelivery(principal: AuthenticatedPrincipal, id: string) {
    const delivery = await this.prisma.webhookDelivery.findFirst({
      where: { id, organizationId: principal.organizationId },
    });
    if (!delivery) throw new NotFoundException('Webhook delivery not found');
    if (delivery.status !== 'FAILED' || !delivery.retryable)
      throw new ConflictException('Webhook delivery is not retryable');
    await this.prisma.webhookDelivery.update({
      where: { id },
      data: { status: 'PENDING', lastError: null },
    });
    await this.jobs.enqueueWebhookDelivery(id);
    await this.audit.create({
      action: 'INTEGRATION_EVENT_RETRIED',
      actorId: principal.userId,
      entityId: id,
      entityType: 'WEBHOOK',
      organizationId: principal.organizationId,
    });
    return { accepted: true };
  }

  async publishBusinessEvent(
    organizationId: string,
    eventType: string,
    entityId: string,
    data: Record<string, unknown>,
    externalEventId: string = randomUUID(),
  ) {
    if (!SUPPORTED_WEBHOOK_EVENTS.has(eventType)) return null;
    const subscriptions = await this.prisma.webhookSubscription.findMany({
      where: {
        organizationId,
        active: true,
        eventTypes: { has: eventType },
        connection: { status: 'ACTIVE', direction: { in: ['OUTBOUND', 'BOTH'] } },
      },
    });
    if (!subscriptions.length) return null;
    const safePayload = { entityId, ...this.redactPayload(data) };
    const event = await this.prisma.integrationEvent.create({
      data: {
        organizationId,
        direction: 'OUTBOUND',
        externalEventId,
        eventType,
        status: 'PROCESSED',
        processedAt: new Date(),
        payload: safePayload,
      },
    });
    const deliveries = await this.prisma.$transaction(
      subscriptions.map((subscription) =>
        this.prisma.webhookDelivery.create({
          data: {
            organizationId,
            subscriptionId: subscription.id,
            eventId: event.id,
            eventType,
            payload: safePayload,
          },
        }),
      ),
    );
    const results = await Promise.allSettled(
      deliveries.map(({ id }) => this.jobs.enqueueWebhookDelivery(id)),
    );
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        this.logger.error(
          `Failed to enqueue webhook delivery deliveryId=${deliveries[index]?.id ?? 'unknown'} eventType=${eventType}: ${this.errorMessage(result.reason)}`,
        );
      }
    });
    return event;
  }

  async triggerConfiguredWebhook(input: {
    organizationId: string;
    subscriptionId: string;
    eventType: string;
    entityId: string;
    payload: Record<string, unknown>;
    idempotencyKey: string;
  }) {
    const subscription = await this.prisma.webhookSubscription.findFirst({
      where: {
        id: input.subscriptionId,
        organizationId: input.organizationId,
        active: true,
        connection: {
          status: 'ACTIVE',
          direction: { in: ['OUTBOUND', 'BOTH'] },
        },
      },
    });
    if (!subscription) throw new BadRequestException('Outbound webhook is invalid or inactive');
    const safePayload = { entityId: input.entityId, ...this.redactPayload(input.payload) };
    const event = await this.prisma.integrationEvent.upsert({
      where: {
        connectionId_externalEventId: {
          connectionId: subscription.connectionId,
          externalEventId: input.idempotencyKey,
        },
      },
      create: {
        organizationId: input.organizationId,
        connectionId: subscription.connectionId,
        direction: 'OUTBOUND',
        externalEventId: input.idempotencyKey,
        eventType: input.eventType,
        status: 'PROCESSED',
        processedAt: new Date(),
        payload: safePayload,
        metadata: { source: 'AUTOMATION' },
      },
      update: {},
    });
    const delivery = await this.prisma.webhookDelivery.upsert({
      where: { subscriptionId_eventId: { subscriptionId: subscription.id, eventId: event.id } },
      create: {
        organizationId: input.organizationId,
        subscriptionId: subscription.id,
        eventId: event.id,
        eventType: input.eventType,
        payload: safePayload,
      },
      update: {},
    });
    if (delivery.status === 'PENDING') await this.jobs.enqueueWebhookDelivery(delivery.id);
    return delivery;
  }

  async recoverPendingWork() {
    const [events, deliveries] = await Promise.all([
      this.prisma.integrationEvent.findMany({
        where: { direction: 'INBOUND', status: 'RECEIVED' },
        select: { id: true },
        take: 100,
      }),
      this.prisma.webhookDelivery.findMany({
        where: {
          status: 'PENDING',
          subscription: { active: true, connection: { status: 'ACTIVE' } },
        },
        select: { id: true },
        take: 100,
      }),
    ]);
    const results = await Promise.allSettled([
      ...events.map(({ id }) => this.jobs.enqueueIntegrationEvent(id)),
      ...deliveries.map(({ id }) => this.jobs.enqueueWebhookDelivery(id)),
    ]);
    const failed = results.filter((result) => result.status === 'rejected').length;
    if (events.length || deliveries.length || failed) {
      this.logger.log(
        `Recovered pending integration work events=${events.length} deliveries=${deliveries.length} enqueueFailures=${failed}`,
      );
    }
    return { events: events.length, deliveries: deliveries.length };
  }

  async processDelivery(deliveryId: string) {
    const delivery = await this.prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
      include: { subscription: { include: { connection: true } } },
    });
    if (
      !delivery ||
      !['PENDING', 'FAILED'].includes(delivery.status) ||
      !delivery.subscription.active ||
      delivery.subscription.connection.status !== 'ACTIVE'
    )
      return;
    await this.urls.validate(delivery.subscription.targetUrl);
    const attempt = delivery.attempt + 1;
    const claimed = await this.prisma.webhookDelivery.updateMany({
      where: { id: deliveryId, status: delivery.status, attempt: delivery.attempt },
      data: { status: 'PROCESSING', attempt },
    });
    if (claimed.count !== 1) return;
    const body = JSON.stringify({
      eventId: delivery.eventId,
      eventType: delivery.eventType,
      occurredAt: delivery.createdAt.toISOString(),
      data: delivery.payload,
    });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac(
      'sha256',
      this.secrets.decrypt(delivery.subscription.encryptedSecret),
    )
      .update(body)
      .digest('hex');
    try {
      const response = await fetch(delivery.subscription.targetUrl, {
        method: 'POST',
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: {
          'content-type': 'application/json',
          'x-unicrm-event': delivery.eventType,
          'x-unicrm-delivery': delivery.id,
          'x-unicrm-timestamp': timestamp,
          'x-unicrm-signature': `sha256=${signature}`,
        },
        body,
        redirect: 'error',
      });
      if (!response.ok) {
        const retryable =
          response.status === 408 || response.status === 429 || response.status >= 500;
        await this.failDelivery(
          deliveryId,
          `Target returned HTTP ${response.status}`,
          response.status,
          retryable,
        );
        if (retryable) throw new Error(`Retryable webhook response: ${response.status}`);
        return;
      }
      await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'DELIVERED',
          statusCode: response.status,
          retryable: false,
          deliveredAt: new Date(),
          lastError: null,
        },
      });
      this.logger.log(
        `Webhook delivery delivered deliveryId=${deliveryId} eventType=${delivery.eventType} statusCode=${response.status} attempt=${attempt}`,
      );
    } catch (error) {
      const current = await this.prisma.webhookDelivery.findUnique({
        where: { id: deliveryId },
        select: { status: true },
      });
      if (current?.status !== 'FAILED')
        await this.failDelivery(
          deliveryId,
          error instanceof Error ? error.message : 'Webhook delivery failed',
          null,
          true,
        );
      throw error;
    }
  }

  listMappings(principal: AuthenticatedPrincipal) {
    return this.prisma.externalEntityMapping.findMany({
      where: { organizationId: principal.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async createMapping(principal: AuthenticatedPrincipal, dto: CreateExternalMappingDto) {
    await this.requireConnection(principal.organizationId, dto.connectionId);
    if (
      !(await this.entityExists(principal.organizationId, dto.unicrmEntityType, dto.unicrmEntityId))
    )
      throw new NotFoundException('UniCRM entity not found');
    try {
      return await this.prisma.externalEntityMapping.create({
        data: { organizationId: principal.organizationId, ...dto },
      });
    } catch (error) {
      if (this.isUniqueConflict(error))
        throw new ConflictException('External entity mapping already exists');
      throw error;
    }
  }

  private verifyInbound(
    encryptedSecret: string,
    rawBody: Buffer,
    signature?: string,
    timestamp?: string,
  ) {
    if (!signature || !timestamp)
      throw new UnauthorizedException('Webhook signature and timestamp are required');
    const seconds = Number(timestamp);
    if (
      !Number.isInteger(seconds) ||
      Math.abs(Date.now() / 1000 - seconds) > this.timestampToleranceSeconds
    )
      throw new UnauthorizedException('Webhook timestamp is invalid or expired');
    const providedHex = signature.startsWith('sha256=') ? signature.slice(7) : signature;
    if (!/^[a-f0-9]{64}$/i.test(providedHex))
      throw new UnauthorizedException('Webhook signature is invalid');
    const expected = createHmac('sha256', this.secrets.decrypt(encryptedSecret))
      .update(rawBody)
      .digest();
    const provided = Buffer.from(providedHex, 'hex');
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected))
      throw new UnauthorizedException('Webhook signature is invalid');
  }

  private async failDelivery(
    id: string,
    message: string,
    statusCode: number | null,
    retryable: boolean,
  ) {
    await this.prisma.webhookDelivery.update({
      where: { id },
      data: { status: 'FAILED', statusCode, retryable, lastError: message.slice(0, 1000) },
    });
    this.logger.warn(
      `Webhook delivery failed deliveryId=${id} statusCode=${statusCode ?? 'none'} retryable=${String(retryable)} error=${message.slice(0, 250)}`,
    );
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
  }

  private validateEventTypes(eventTypes: string[]) {
    if (eventTypes.some((value) => !SUPPORTED_WEBHOOK_EVENTS.has(value)))
      throw new BadRequestException('Webhook subscription contains unsupported event types');
  }

  private validateConfiguration(configuration?: Record<string, unknown>) {
    if (!configuration) return;
    const serialized = JSON.stringify(configuration);
    if (serialized.length > 10_000)
      throw new BadRequestException('Integration configuration is too large');
    const forbidden = /secret|password|token|credential|api[_-]?key/i;
    const inspect = (value: unknown): boolean =>
      !!value &&
      typeof value === 'object' &&
      Object.entries(value as Record<string, unknown>).some(
        ([key, child]) => forbidden.test(key) || inspect(child),
      );
    if (inspect(configuration))
      throw new BadRequestException('Credentials must not be stored in integration configuration');
  }

  private redactPayload(value: Record<string, unknown>): Record<string, unknown> {
    const sensitive = /password|secret|token|authorization|cookie|credential|api[_-]?key/i;
    const clean = (input: unknown, depth: number): unknown => {
      if (depth > 8) return '[TRUNCATED]';
      if (typeof input === 'string') return input.slice(0, 2000);
      if (Array.isArray(input)) return input.slice(0, 100).map((entry) => clean(entry, depth + 1));
      if (input && typeof input === 'object')
        return Object.fromEntries(
          Object.entries(input as Record<string, unknown>)
            .slice(0, 100)
            .map(([key, child]) => [
              key,
              sensitive.test(key) ? '[REDACTED]' : clean(child, depth + 1),
            ]),
        );
      return input;
    };
    return clean(value, 0) as Record<string, unknown>;
  }

  private requireConnection(organizationId: string, id: string) {
    return this.prisma.integrationConnection
      .findFirst({ where: { id, organizationId } })
      .then((connection) => {
        if (!connection) throw new NotFoundException('Integration connection not found');
        return connection;
      });
  }

  private requireSubscription(organizationId: string, id: string) {
    return this.prisma.webhookSubscription
      .findFirst({ where: { id, organizationId } })
      .then((subscription) => {
        if (!subscription) throw new NotFoundException('Webhook subscription not found');
        return subscription;
      });
  }

  private async entityExists(organizationId: string, type: string, id: string) {
    const where = { id, organizationId };
    if (type === 'LEAD')
      return !!(await this.prisma.lead.findFirst({ where, select: { id: true } }));
    if (type === 'COMPANY')
      return !!(await this.prisma.company.findFirst({ where, select: { id: true } }));
    if (type === 'CONTACT')
      return !!(await this.prisma.contact.findFirst({ where, select: { id: true } }));
    if (type === 'PROJECT')
      return !!(await this.prisma.project.findFirst({ where, select: { id: true } }));
    return !!(await this.prisma.task.findFirst({ where, select: { id: true } }));
  }

  private isUniqueConflict(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
  }
}
