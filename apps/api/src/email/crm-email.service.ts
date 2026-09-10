import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import { isEmail } from 'class-validator';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { EmailMessageStatus, EmailRelatedEntityType } from '../generated/prisma/enums';
import { JobsService } from '../jobs/jobs.service';
import { RedisService } from '../redis/redis.service';
import type {
  CreateEmailTemplateDto,
  EmailHistoryQueryDto,
  SendCrmEmailDto,
  UpdateEmailSettingsDto,
  UpdateEmailTemplateDto,
} from './dto/crm-email.dto';
import type { EmailRecipientSource } from './email.constants';
import { EmailService, EmailTransportService } from './email.service';
import { renderTemplate, validateTemplate } from './template-renderer';

type Context = {
  recipient?: string;
  values: Record<string, string | undefined>;
};

@Injectable()
export class CrmEmailService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(EmailService) private readonly email: EmailService,
    @Inject(EmailTransportService) private readonly transport: EmailTransportService,
    @Inject(RedisService) private readonly redis: RedisService,
  ) {}

  listTemplates(principal: AuthenticatedPrincipal, active?: boolean) {
    return this.prisma.emailTemplate.findMany({
      where: {
        organizationId: principal.organizationId,
        ...(active === undefined ? {} : { active }),
      },
      include: { createdBy: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async createTemplate(principal: AuthenticatedPrincipal, dto: CreateEmailTemplateDto) {
    this.validateTemplateInput(dto.subject, dto.body);
    try {
      return await this.prisma.emailTemplate.create({
        data: {
          organizationId: principal.organizationId,
          createdById: principal.userId,
          name: dto.name.trim(),
          subject: dto.subject.trim(),
          body: dto.body,
          active: dto.active ?? true,
        },
      });
    } catch (error) {
      if (this.isUnique(error))
        throw new ConflictException('An email template with this name already exists');
      throw error;
    }
  }

  async updateTemplate(principal: AuthenticatedPrincipal, id: string, dto: UpdateEmailTemplateDto) {
    const current = await this.requireTemplate(principal.organizationId, id, false);
    this.validateTemplateInput(dto.subject ?? current.subject, dto.body ?? current.body);
    try {
      return await this.prisma.emailTemplate.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.subject !== undefined ? { subject: dto.subject.trim() } : {}),
          ...(dto.body !== undefined ? { body: dto.body } : {}),
          ...(dto.active !== undefined ? { active: dto.active } : {}),
        },
      });
    } catch (error) {
      if (this.isUnique(error))
        throw new ConflictException('An email template with this name already exists');
      throw error;
    }
  }

  async duplicateTemplate(principal: AuthenticatedPrincipal, id: string) {
    const template = await this.requireTemplate(principal.organizationId, id, false);
    let name = `${template.name} (copy)`;
    let suffix = 2;
    while (
      await this.prisma.emailTemplate.findUnique({
        where: { organizationId_name: { organizationId: principal.organizationId, name } },
        select: { id: true },
      })
    )
      name = `${template.name} (copy ${suffix++})`;
    return this.createTemplate(principal, {
      name,
      subject: template.subject,
      body: template.body,
      active: false,
    });
  }

  async preview(
    principal: AuthenticatedPrincipal,
    id: string,
    entityType: EmailRelatedEntityType,
    entityId: string,
  ) {
    const template = await this.requireTemplate(principal.organizationId, id, false);
    const context = await this.context(
      principal.organizationId,
      principal.userId,
      entityType,
      entityId,
    );
    return {
      subject: renderTemplate(template.subject, context.values),
      body: renderTemplate(template.body, context.values),
    };
  }

  async sendTest(principal: AuthenticatedPrincipal, id: string, to: string) {
    await this.consumeRateLimit(principal.organizationId, principal.userId);
    this.cleanAddresses([to]);
    const template = await this.requireTemplate(principal.organizationId, id, false);
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: principal.organizationId },
    });
    if (!organization.emailFromName || !organization.emailFromAddress)
      throw new BadRequestException('Organization email identity is not configured');
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: principal.userId } });
    const values = { 'user.firstName': user.firstName, 'organization.name': organization.name };
    await this.email.send({
      to: to.trim().toLowerCase(),
      subject: renderTemplate(template.subject, values),
      text: renderTemplate(template.body, values),
      fromName: organization.emailFromName,
      fromAddress: organization.emailFromAddress,
      replyTo: organization.emailReplyTo ?? undefined,
    });
    return { queued: true };
  }

  async getSettings(principal: AuthenticatedPrincipal) {
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: principal.organizationId },
      select: { emailFromName: true, emailFromAddress: true, emailReplyTo: true },
    });
    return {
      fromName: organization.emailFromName,
      fromAddress: organization.emailFromAddress,
      replyTo: organization.emailReplyTo,
    };
  }

  async updateSettings(principal: AuthenticatedPrincipal, dto: UpdateEmailSettingsDto) {
    this.rejectHeaderInjection(dto.fromName, dto.fromAddress, dto.replyTo);
    return this.prisma.organization.update({
      where: { id: principal.organizationId },
      data: {
        emailFromName: dto.fromName.trim(),
        emailFromAddress: dto.fromAddress.trim().toLowerCase(),
        emailReplyTo: dto.replyTo?.trim().toLowerCase() || null,
      },
      select: { emailFromName: true, emailFromAddress: true, emailReplyTo: true },
    });
  }

  async composeContext(
    principal: AuthenticatedPrincipal,
    entityType: EmailRelatedEntityType,
    entityId: string,
  ) {
    const [context, settings, templates] = await Promise.all([
      this.context(principal.organizationId, principal.userId, entityType, entityId),
      this.getSettings(principal),
      this.listTemplates(principal, true),
    ]);
    return { recipient: context.recipient, settings, templates };
  }

  async send(principal: AuthenticatedPrincipal, dto: SendCrmEmailDto) {
    await this.consumeRateLimit(principal.organizationId, principal.userId);
    await this.context(
      principal.organizationId,
      principal.userId,
      dto.relatedEntityType,
      dto.relatedEntityId,
    );
    if (dto.templateId) await this.requireTemplate(principal.organizationId, dto.templateId, false);
    return this.persistAndQueue({
      organizationId: principal.organizationId,
      senderUserId: principal.userId,
      relatedEntityType: dto.relatedEntityType,
      relatedEntityId: dto.relatedEntityId,
      templateId: dto.templateId,
      to: dto.to,
      cc: dto.cc ?? [],
      subject: dto.subject,
      body: dto.body,
    });
  }

  async sendAutomation(input: {
    organizationId: string;
    senderUserId: string;
    entityType: string;
    entityId: string;
    templateId: string;
    recipientSource: EmailRecipientSource;
    idempotencyKey: string;
  }) {
    if (!['LEAD', 'CONTACT', 'COMPANY'].includes(input.entityType))
      throw new BadRequestException('Send email is not supported for this automation entity');
    const entityType = input.entityType as EmailRelatedEntityType;
    const template = await this.requireTemplate(input.organizationId, input.templateId, true);
    const context = await this.context(
      input.organizationId,
      input.senderUserId,
      entityType,
      input.entityId,
      input.recipientSource,
    );
    if (!context.recipient)
      throw new BadRequestException('Automation email recipient is unavailable');
    return this.persistAndQueue({
      ...input,
      relatedEntityType: entityType,
      relatedEntityId: input.entityId,
      to: [context.recipient],
      cc: [],
      subject: renderTemplate(template.subject, context.values),
      body: renderTemplate(template.body, context.values),
    });
  }

  async history(principal: AuthenticatedPrincipal, query: EmailHistoryQueryDto) {
    await this.context(
      principal.organizationId,
      principal.userId,
      query.relatedEntityType,
      query.relatedEntityId,
    );
    const where = {
      organizationId: principal.organizationId,
      relatedEntityType: query.relatedEntityType,
      relatedEntityId: query.relatedEntityId,
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.emailMessage.findMany({
        where,
        select: {
          id: true,
          subject: true,
          toAddresses: true,
          fromName: true,
          fromAddress: true,
          status: true,
          sentAt: true,
          failedAt: true,
          createdAt: true,
          safeErrorSummary: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.emailMessage.count({ where }),
    ]);
    return {
      data,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  }

  async detail(principal: AuthenticatedPrincipal, id: string) {
    const message = await this.prisma.emailMessage.findFirst({
      where: { id, organizationId: principal.organizationId },
    });
    if (!message) throw new NotFoundException('Email message not found');
    return message;
  }

  async processDelivery(messageId: string, attemptsMade: number, maxAttempts: number) {
    const message = await this.prisma.emailMessage.findUnique({ where: { id: messageId } });
    if (!message || message.status === EmailMessageStatus.SENT) return;
    await this.prisma.emailMessage.update({
      where: { id: message.id },
      data: { status: EmailMessageStatus.SENDING, safeErrorSummary: null },
    });
    try {
      await this.transport.deliver({
        to: message.toAddresses.join(', '),
        cc: message.ccAddresses,
        subject: message.subject,
        text: message.body,
        fromName: message.fromName,
        fromAddress: message.fromAddress,
        replyTo: message.replyTo ?? undefined,
      });
      await this.prisma.$transaction(async (tx) => {
        const sentAt = new Date();
        await tx.emailMessage.update({
          where: { id: message.id },
          data: { status: EmailMessageStatus.SENT, sentAt, failedAt: null, safeErrorSummary: null },
        });
        await tx.activityLog.create({
          data: {
            organizationId: message.organizationId,
            actorId: message.senderUserId,
            entityType: message.relatedEntityType,
            entityId: message.relatedEntityId,
            action: 'EMAIL_SENT',
            metadata: {
              emailMessageId: message.id,
              subject: message.subject,
              recipients: message.toAddresses,
            },
          },
        });
        if (message.relatedEntityType === EmailRelatedEntityType.LEAD)
          await tx.leadActivity.create({
            data: {
              organizationId: message.organizationId,
              leadId: message.relatedEntityId,
              createdById: message.senderUserId,
              type: 'EMAIL',
              title: 'Email sent',
              description: message.subject,
              occurredAt: sentAt,
              metadata: { emailMessageId: message.id, recipients: message.toAddresses },
            },
          });
      });
    } catch (error) {
      const permanent = this.permanentFailure(error);
      const finalAttempt = permanent || attemptsMade + 1 >= maxAttempts;
      await this.prisma.emailMessage.update({
        where: { id: message.id },
        data: {
          status: finalAttempt ? EmailMessageStatus.FAILED : EmailMessageStatus.QUEUED,
          failedAt: finalAttempt ? new Date() : null,
          safeErrorSummary: this.safeError(error),
        },
      });
      if (permanent) throw new UnrecoverableError(this.safeError(error));
      throw error;
    }
  }

  async recoverQueued() {
    const messages = await this.prisma.emailMessage.findMany({
      where: {
        status: { in: [EmailMessageStatus.QUEUED, EmailMessageStatus.SENDING] },
        queuedAt: { lt: new Date(Date.now() - 60_000) },
      },
      select: { id: true },
      take: 100,
    });
    await Promise.allSettled(messages.map(({ id }) => this.jobs.enqueueCrmEmail(id)));
    return { messages: messages.length };
  }

  private async persistAndQueue(input: {
    organizationId: string;
    senderUserId: string;
    templateId?: string;
    relatedEntityType: EmailRelatedEntityType;
    relatedEntityId: string;
    to: string[];
    cc: string[];
    subject: string;
    body: string;
    idempotencyKey?: string;
  }) {
    const to = this.cleanAddresses(input.to);
    const cc = this.cleanAddresses(input.cc);
    if (!to.length) throw new BadRequestException('At least one recipient is required');
    if (to.length + cc.length > 20)
      throw new BadRequestException('A maximum of 20 recipients is allowed');
    this.rejectHeaderInjection(input.subject);
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: input.organizationId },
      select: { emailFromName: true, emailFromAddress: true, emailReplyTo: true },
    });
    if (!organization.emailFromName || !organization.emailFromAddress)
      throw new BadRequestException('Organization email identity is not configured');
    this.rejectHeaderInjection(
      organization.emailFromName,
      organization.emailFromAddress,
      organization.emailReplyTo ?? undefined,
    );
    if (input.idempotencyKey) {
      const existing = await this.prisma.emailMessage.findUnique({
        where: {
          organizationId_idempotencyKey: {
            organizationId: input.organizationId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (existing) return existing;
    }
    const message = await this.prisma.emailMessage.create({
      data: {
        organizationId: input.organizationId,
        senderUserId: input.senderUserId,
        templateId: input.templateId,
        relatedEntityType: input.relatedEntityType,
        relatedEntityId: input.relatedEntityId,
        fromName: organization.emailFromName,
        fromAddress: organization.emailFromAddress,
        replyTo: organization.emailReplyTo,
        toAddresses: to,
        ccAddresses: cc,
        subject: input.subject.trim(),
        body: input.body,
        status: EmailMessageStatus.QUEUED,
        queuedAt: new Date(),
        idempotencyKey: input.idempotencyKey,
      },
    });
    try {
      await this.jobs.enqueueCrmEmail(message.id);
    } catch {
      await this.prisma.emailMessage.update({
        where: { id: message.id },
        data: {
          status: EmailMessageStatus.FAILED,
          failedAt: new Date(),
          safeErrorSummary: 'Email queue is unavailable',
        },
      });
      throw new ServiceUnavailableException('Email queue is unavailable');
    }
    return message;
  }

  private async context(
    organizationId: string,
    userId: string,
    entityType: EmailRelatedEntityType,
    entityId: string,
    source?: EmailRecipientSource,
  ): Promise<Context> {
    const [organization, user] = await Promise.all([
      this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { name: true },
      }),
      this.prisma.user.findFirst({
        where: { id: userId, organizationId },
        select: { firstName: true },
      }),
    ]);
    if (!organization || !user) throw new NotFoundException('Email context not found');
    const values: Record<string, string | undefined> = {
      'organization.name': organization.name,
      'user.firstName': user.firstName,
    };
    let recipient: string | undefined;
    if (entityType === EmailRelatedEntityType.LEAD) {
      const lead = await this.prisma.lead.findFirst({
        where: { id: entityId, organizationId, archivedAt: null },
        include: {
          company: { select: { name: true } },
          contact: { select: { firstName: true, lastName: true, email: true } },
        },
      });
      if (!lead) throw new NotFoundException('Lead not found');
      Object.assign(values, {
        'lead.title': lead.title,
        'company.name': lead.company?.name,
        'contact.firstName': lead.contact?.firstName,
        'contact.lastName': lead.contact?.lastName,
      });
      recipient =
        source === 'PRIMARY_CONTACT'
          ? (lead.contact?.email ?? undefined)
          : (lead.email ?? undefined);
      if (source === 'CONTACT_EMAIL')
        throw new BadRequestException('Contact email is not valid for a lead');
    } else if (entityType === EmailRelatedEntityType.CONTACT) {
      const contact = await this.prisma.contact.findFirst({
        where: { id: entityId, organizationId, archivedAt: null },
        include: { company: { select: { name: true } } },
      });
      if (!contact) throw new NotFoundException('Contact not found');
      Object.assign(values, {
        'contact.firstName': contact.firstName,
        'contact.lastName': contact.lastName,
        'company.name': contact.company?.name,
      });
      recipient = contact.email ?? undefined;
      if (source && source !== 'CONTACT_EMAIL')
        throw new BadRequestException('Recipient source is invalid for a contact');
    } else {
      const company = await this.prisma.company.findFirst({
        where: { id: entityId, organizationId, archivedAt: null },
        include: {
          contacts: {
            where: { archivedAt: null, isPrimary: true },
            take: 1,
            select: { firstName: true, lastName: true, email: true },
          },
        },
      });
      if (!company) throw new NotFoundException('Company not found');
      const contact = company.contacts[0];
      Object.assign(values, {
        'company.name': company.name,
        'contact.firstName': contact?.firstName,
        'contact.lastName': contact?.lastName,
      });
      recipient =
        source === 'PRIMARY_CONTACT' ? (contact?.email ?? undefined) : (company.email ?? undefined);
      if (source && source !== 'PRIMARY_CONTACT')
        throw new BadRequestException('Recipient source is invalid for a company');
    }
    return { recipient: recipient ?? undefined, values };
  }

  private requireTemplate(organizationId: string, id: string, active: boolean) {
    return this.prisma.emailTemplate
      .findFirst({ where: { id, organizationId, ...(active ? { active: true } : {}) } })
      .then((template) => {
        if (!template) throw new NotFoundException('Email template not found');
        return template;
      });
  }
  private validateTemplateInput(subject: string, body: string) {
    this.rejectHeaderInjection(subject);
    validateTemplate(subject);
    validateTemplate(body);
  }
  private cleanAddresses(addresses: string[]) {
    return [
      ...new Set(
        addresses
          .map((address) => address.trim().toLowerCase())
          .filter(Boolean)
          .map((address) => {
            this.rejectHeaderInjection(address);
            if (!isEmail(address))
              throw new BadRequestException(`Invalid email address: ${address}`);
            return address;
          }),
      ),
    ];
  }
  private rejectHeaderInjection(...values: Array<string | undefined>) {
    if (values.some((value) => /[\r\n]/.test(value ?? '')))
      throw new BadRequestException('Email headers cannot contain line breaks');
  }
  private permanentFailure(error: unknown) {
    const code =
      typeof error === 'object' && error && 'responseCode' in error
        ? Number((error as { responseCode?: unknown }).responseCode)
        : 0;
    return code >= 500 && code < 600;
  }
  private safeError(error: unknown) {
    return (error instanceof Error ? error.message : 'Email delivery failed')
      .replace(/(?:password|secret|token)=[^\s]+/gi, '$1=[redacted]')
      .slice(0, 1000);
  }
  private isUnique(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    );
  }

  private async consumeRateLimit(organizationId: string, userId: string) {
    const count = await this.redis.incrementWithExpiry(
      `rate:crm-email:${organizationId}:${userId}`,
      60,
    );
    if (count > 20)
      throw new HttpException('Email send rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
  }
}
