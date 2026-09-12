import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { simpleParser, type ParsedMail } from 'mailparser';
import { basename } from 'node:path';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import { ATTACHMENT_STORAGE, type AttachmentStorage } from '../attachments/storage.service';
import type { EnvironmentVariables } from '../config/environment';
import { PrismaService } from '../database/prisma.service';
import {
  EmailDirection,
  EmailMessageStatus,
  EmailRelatedEntityType,
  MailboxConnectionStatus,
} from '../generated/prisma/enums';
import { IntegrationSecretService } from '../integrations/integration-secret.service';
import { JobsService } from '../jobs/jobs.service';
import { MailboxTransportService } from '../email/mailbox-transport.service';
import type { MailboxConnection } from '../generated/prisma/client';
import type {
  CreateMailboxDto,
  LinkThreadDto,
  MailListQueryDto,
  ReplyThreadDto,
  UpdateMailboxDto,
} from './dto/mailboxes.dto';
import {
  nextUidRange,
  normalizeEmail,
  normalizeMessageId,
  normalizeReferences,
  safeFileName,
  safeMailboxError,
  type MailboxSyncState,
} from './mailbox.helpers';

const mailboxPublicSelect = {
  id: true,
  name: true,
  emailAddress: true,
  displayName: true,
  status: true,
  incomingProtocol: true,
  imapHost: true,
  imapPort: true,
  imapSecure: true,
  smtpHost: true,
  smtpPort: true,
  smtpSecure: true,
  username: true,
  lastSyncedAt: true,
  safeErrorSummary: true,
  createdAt: true,
  updatedAt: true,
} as const;

const ALLOWED_ATTACHMENT_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'text/csv',
  'text/plain',
]);

@Injectable()
export class MailboxesService {
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ConfigService) private readonly config: ConfigService<EnvironmentVariables, true>,
    @Inject(ATTACHMENT_STORAGE) private readonly storage: AttachmentStorage,
    @Inject(IntegrationSecretService) private readonly secrets: IntegrationSecretService,
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(MailboxTransportService) private readonly transport: MailboxTransportService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  listMailboxes(principal: AuthenticatedPrincipal) {
    return this.prisma.mailboxConnection.findMany({
      where: { organizationId: principal.organizationId },
      select: mailboxPublicSelect,
      orderBy: { emailAddress: 'asc' },
    });
  }

  listAvailableMailboxes(principal: AuthenticatedPrincipal) {
    return this.prisma.mailboxConnection.findMany({
      where: {
        organizationId: principal.organizationId,
        status: { not: MailboxConnectionStatus.DISABLED },
      },
      select: { id: true, name: true, emailAddress: true, displayName: true, status: true },
      orderBy: { emailAddress: 'asc' },
    });
  }

  async createMailbox(principal: AuthenticatedPrincipal, dto: CreateMailboxDto) {
    this.validateConnection(dto);
    try {
      const mailbox = await this.prisma.$transaction(async (tx) => {
        const created = await tx.mailboxConnection.create({
          data: {
            organizationId: principal.organizationId,
            name: dto.name.trim(),
            emailAddress: dto.emailAddress.trim().toLowerCase(),
            displayName: dto.displayName?.trim() || null,
            imapHost: dto.imapHost.trim(),
            imapPort: dto.imapPort,
            imapSecure: dto.imapSecure,
            smtpHost: dto.smtpHost.trim(),
            smtpPort: dto.smtpPort,
            smtpSecure: dto.smtpSecure,
            username: dto.username.trim(),
            encryptedCredential: this.secrets.encrypt(dto.credential),
          },
          select: mailboxPublicSelect,
        });
        await this.audit.create(
          {
            action: 'MAILBOX_CREATED',
            actorId: principal.userId,
            entityId: created.id,
            entityType: 'MAILBOX',
            organizationId: principal.organizationId,
            metadata: { emailAddress: created.emailAddress },
          },
          tx,
        );
        return created;
      });
      return mailbox;
    } catch (error) {
      if (this.isUnique(error)) throw new ConflictException('This mailbox is already connected');
      throw error;
    }
  }

  async updateMailbox(principal: AuthenticatedPrincipal, id: string, dto: UpdateMailboxDto) {
    const current = await this.requireMailbox(principal.organizationId, id);
    const combined = { ...current, ...dto };
    this.validateConnection(combined);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.mailboxConnection.update({
          where: { id },
          data: {
            ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
            ...(dto.emailAddress !== undefined
              ? { emailAddress: dto.emailAddress.trim().toLowerCase() }
              : {}),
            ...(dto.displayName !== undefined
              ? { displayName: dto.displayName.trim() || null }
              : {}),
            ...(dto.imapHost !== undefined ? { imapHost: dto.imapHost.trim() } : {}),
            ...(dto.imapPort !== undefined ? { imapPort: dto.imapPort } : {}),
            ...(dto.imapSecure !== undefined ? { imapSecure: dto.imapSecure } : {}),
            ...(dto.smtpHost !== undefined ? { smtpHost: dto.smtpHost.trim() } : {}),
            ...(dto.smtpPort !== undefined ? { smtpPort: dto.smtpPort } : {}),
            ...(dto.smtpSecure !== undefined ? { smtpSecure: dto.smtpSecure } : {}),
            ...(dto.username !== undefined ? { username: dto.username.trim() } : {}),
            ...(dto.credential !== undefined
              ? { encryptedCredential: this.secrets.encrypt(dto.credential) }
              : {}),
            ...(dto.enabled !== undefined
              ? {
                  status: dto.enabled
                    ? MailboxConnectionStatus.CONNECTED
                    : MailboxConnectionStatus.DISABLED,
                  safeErrorSummary: null,
                }
              : {}),
          },
          select: mailboxPublicSelect,
        });
        await this.audit.create(
          {
            action: 'MAILBOX_UPDATED',
            actorId: principal.userId,
            entityId: id,
            entityType: 'MAILBOX',
            organizationId: principal.organizationId,
            metadata: { credentialReplaced: dto.credential !== undefined },
          },
          tx,
        );
        return updated;
      });
    } catch (error) {
      if (this.isUnique(error)) throw new ConflictException('This mailbox is already connected');
      throw error;
    }
  }

  async testImap(principal: AuthenticatedPrincipal, id: string) {
    const mailbox = await this.requireMailbox(principal.organizationId, id);
    try {
      await this.transport.verifyImap(mailbox, this.secrets.decrypt(mailbox.encryptedCredential));
      await this.clearConnectionError(mailbox.id);
      return { connected: true };
    } catch (error) {
      const summary = safeMailboxError(error);
      await this.setConnectionError(mailbox.id, summary);
      throw new ServiceUnavailableException(summary);
    }
  }

  async testSmtp(principal: AuthenticatedPrincipal, id: string) {
    const mailbox = await this.requireMailbox(principal.organizationId, id);
    try {
      await this.transport.verifySmtp(mailbox, this.secrets.decrypt(mailbox.encryptedCredential));
      await this.clearConnectionError(mailbox.id);
      return { connected: true };
    } catch (error) {
      const summary = safeMailboxError(error);
      await this.setConnectionError(mailbox.id, summary);
      throw new ServiceUnavailableException(summary);
    }
  }

  async requestSync(principal: AuthenticatedPrincipal, id: string) {
    const mailbox = await this.requireMailbox(principal.organizationId, id);
    if (mailbox.status === MailboxConnectionStatus.DISABLED)
      throw new BadRequestException('Disabled mailboxes cannot be synchronized');
    await this.jobs.enqueueMailboxSync(id);
    return { queued: true };
  }

  async recoverMailboxes() {
    const mailboxes = await this.prisma.mailboxConnection.findMany({
      where: { status: { not: MailboxConnectionStatus.DISABLED } },
      select: { id: true },
      take: 250,
    });
    await Promise.allSettled(mailboxes.map(({ id }) => this.jobs.enqueueMailboxSync(id)));
    return { mailboxes: mailboxes.length };
  }

  async syncMailbox(id: string) {
    const staleAt = new Date(Date.now() - 5 * 60_000);
    const claimed = await this.prisma.mailboxConnection.updateMany({
      where: {
        id,
        status: { not: MailboxConnectionStatus.DISABLED },
        OR: [{ status: { not: MailboxConnectionStatus.SYNCING } }, { updatedAt: { lt: staleAt } }],
      },
      data: { status: MailboxConnectionStatus.SYNCING, safeErrorSummary: null },
    });
    if (!claimed.count) return { messages: 0, skipped: true };
    const mailbox = await this.prisma.mailboxConnection.findUniqueOrThrow({ where: { id } });
    const client = this.transport.createImapClient(
      mailbox,
      this.secrets.decrypt(mailbox.encryptedCredential),
    );
    const nextState: MailboxSyncState = { folders: {} };
    let imported = 0;
    try {
      await client.connect();
      const available = await client.list();
      const sent = available.find((folder) => folder.specialUse === '\\Sent');
      const folders = [
        { path: 'INBOX', key: 'INBOX', direction: EmailDirection.INBOUND },
        ...(sent && sent.path !== 'INBOX'
          ? [{ path: sent.path, key: 'SENT', direction: EmailDirection.OUTBOUND }]
          : []),
      ];
      const previous = (mailbox.syncState ?? {}) as MailboxSyncState;
      for (const folder of folders) {
        const selected = await client.mailboxOpen(folder.path, { readOnly: true });
        const uidValidity = selected.uidValidity.toString();
        const range = nextUidRange({
          currentUidValidity: uidValidity,
          exists: selected.exists,
          uidNext: selected.uidNext,
          previous: previous.folders?.[folder.key],
          batchSize: this.config.get('MAILBOX_SYNC_BATCH_SIZE', { infer: true }),
        });
        let lastUid = previous.folders?.[folder.key]?.lastUid ?? 0;
        if (range) {
          for await (const fetched of client.fetch(
            range,
            { uid: true, size: true, source: true, internalDate: true },
            { uid: true },
          )) {
            lastUid = Math.max(lastUid, fetched.uid);
            if (!fetched.source) continue;
            if (
              (fetched.size ?? fetched.source.length) >
              this.config.get('MAILBOX_MESSAGE_MAX_BYTES', { infer: true })
            )
              continue;
            const parsed = await simpleParser(fetched.source, {
              maxHtmlLengthToParse: this.config.get('MAILBOX_MESSAGE_MAX_BYTES', { infer: true }),
            });
            if (
              await this.persistSynchronizedMessage(
                mailbox,
                folder.path,
                folder.direction,
                String(fetched.uid),
                parsed,
                fetched.internalDate,
              )
            )
              imported += 1;
          }
        }
        nextState.folders![folder.key] = { uidValidity, lastUid };
      }
      await this.prisma.mailboxConnection.update({
        where: { id },
        data: {
          status: MailboxConnectionStatus.CONNECTED,
          lastSyncedAt: new Date(),
          syncState: nextState,
          safeErrorSummary: null,
        },
      });
      return { messages: imported, skipped: false };
    } catch (error) {
      await this.setConnectionError(id, safeMailboxError(error));
      throw error;
    } finally {
      if (!client.isClosed) {
        try {
          await client.logout();
        } catch {
          client.close();
        }
      }
    }
  }

  async listMessages(principal: AuthenticatedPrincipal, query: MailListQueryDto) {
    if (query.mailboxId) await this.requireMailbox(principal.organizationId, query.mailboxId);
    const where = {
      organizationId: principal.organizationId,
      ...(query.mailboxId ? { mailboxConnectionId: query.mailboxId } : {}),
      ...(query.view === 'UNMATCHED'
        ? { direction: EmailDirection.INBOUND, relatedEntityId: null }
        : { direction: query.view === 'SENT' ? EmailDirection.OUTBOUND : EmailDirection.INBOUND }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.emailMessage.findMany({
        where,
        select: {
          id: true,
          threadId: true,
          direction: true,
          fromName: true,
          fromAddress: true,
          toAddresses: true,
          subject: true,
          body: true,
          status: true,
          receivedAt: true,
          sentAt: true,
          createdAt: true,
          relatedEntityType: true,
          relatedEntityId: true,
          mailboxConnection: { select: { id: true, emailAddress: true, name: true } },
        },
        orderBy: [{ receivedAt: 'desc' }, { createdAt: 'desc' }],
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

  async thread(principal: AuthenticatedPrincipal, id: string) {
    const thread = await this.prisma.emailThread.findFirst({
      where: { id, organizationId: principal.organizationId },
      include: {
        mailboxConnection: { select: { id: true, name: true, emailAddress: true, status: true } },
        messages: {
          include: { attachments: true },
          orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });
    if (!thread) throw new NotFoundException('Email thread not found');
    return thread;
  }

  async linkThread(principal: AuthenticatedPrincipal, id: string, dto: LinkThreadDto) {
    const thread = await this.requireThread(principal.organizationId, id);
    if (thread.relatedEntityId)
      throw new ConflictException('This email thread is already linked to a CRM record');
    await this.requireEntity(principal.organizationId, dto.relatedEntityType, dto.relatedEntityId);
    const latestInbound = await this.prisma.emailMessage.findFirst({
      where: {
        threadId: thread.id,
        organizationId: principal.organizationId,
        direction: EmailDirection.INBOUND,
      },
      orderBy: [{ receivedAt: 'desc' }, { createdAt: 'desc' }],
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.emailThread.update({
        where: { id: thread.id },
        data: { relatedEntityType: dto.relatedEntityType, relatedEntityId: dto.relatedEntityId },
      });
      await tx.emailMessage.updateMany({
        where: { threadId: thread.id, organizationId: principal.organizationId },
        data: { relatedEntityType: dto.relatedEntityType, relatedEntityId: dto.relatedEntityId },
      });
      await this.audit.create(
        {
          action: 'EMAIL_THREAD_LINKED',
          actorId: principal.userId,
          entityId: thread.id,
          entityType: 'EMAIL_THREAD',
          organizationId: principal.organizationId,
          metadata: {
            relatedEntityType: dto.relatedEntityType,
            relatedEntityId: dto.relatedEntityId,
          },
        },
        tx,
      );
      if (latestInbound) {
        await tx.activityLog.create({
          data: {
            organizationId: principal.organizationId,
            actorId: principal.userId,
            entityType: dto.relatedEntityType,
            entityId: dto.relatedEntityId,
            action: 'EMAIL_RECEIVED',
            metadata: {
              emailMessageId: latestInbound.id,
              subject: latestInbound.subject,
              from: latestInbound.fromAddress,
            },
          },
        });
        if (dto.relatedEntityType === EmailRelatedEntityType.LEAD)
          await tx.leadActivity.create({
            data: {
              organizationId: principal.organizationId,
              leadId: dto.relatedEntityId,
              createdById: principal.userId,
              type: 'EMAIL',
              title: 'Email received',
              description: `${latestInbound.subject}\nFrom: ${latestInbound.fromAddress}`,
              occurredAt: latestInbound.receivedAt ?? latestInbound.createdAt,
              metadata: { emailMessageId: latestInbound.id },
            },
          });
      }
    });
    return this.thread(principal, id);
  }

  async reply(principal: AuthenticatedPrincipal, id: string, dto: ReplyThreadDto) {
    const thread = await this.requireThread(principal.organizationId, id);
    if (!thread.mailboxConnectionId)
      throw new BadRequestException('This thread is not associated with a connected mailbox');
    if (dto.mailboxConnectionId !== thread.mailboxConnectionId)
      throw new BadRequestException('Replies must use the mailbox associated with this thread');
    const mailbox = await this.requireMailbox(principal.organizationId, dto.mailboxConnectionId);
    if (mailbox.status === MailboxConnectionStatus.DISABLED)
      throw new BadRequestException('The selected mailbox is disabled');
    const latestInbound = await this.prisma.emailMessage.findFirst({
      where: {
        threadId: id,
        organizationId: principal.organizationId,
        direction: EmailDirection.INBOUND,
      },
      orderBy: [{ receivedAt: 'desc' }, { createdAt: 'desc' }],
    });
    if (!latestInbound)
      throw new BadRequestException('This thread has no inbound message to reply to');
    this.rejectHeaderInjection(dto.subject);
    const externalMessageId = this.createMessageId(mailbox.emailAddress);
    const references = [
      ...new Set([
        ...latestInbound.references,
        ...(latestInbound.externalMessageId ? [latestInbound.externalMessageId] : []),
      ]),
    ];
    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.emailMessage.create({
        data: {
          organizationId: principal.organizationId,
          senderUserId: principal.userId,
          mailboxConnectionId: mailbox.id,
          threadId: thread.id,
          direction: EmailDirection.OUTBOUND,
          relatedEntityType: thread.relatedEntityType,
          relatedEntityId: thread.relatedEntityId,
          fromName: mailbox.displayName ?? mailbox.name,
          fromAddress: mailbox.emailAddress,
          toAddresses: [latestInbound.fromAddress],
          ccAddresses: [],
          subject: dto.subject.trim(),
          body: dto.body,
          externalMessageId,
          inReplyTo: latestInbound.externalMessageId,
          references,
          status: EmailMessageStatus.QUEUED,
          queuedAt: new Date(),
        },
      });
      await tx.emailThread.update({ where: { id }, data: { lastMessageAt: new Date() } });
      return created;
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

  async downloadAttachment(principal: AuthenticatedPrincipal, id: string) {
    const attachment = await this.prisma.emailAttachment.findFirst({
      where: { id, organizationId: principal.organizationId },
    });
    if (!attachment) throw new NotFoundException('Email attachment not found');
    return { attachment, content: await this.storage.get(attachment.storageKey) };
  }

  private async persistSynchronizedMessage(
    mailbox: MailboxConnection,
    folder: string,
    direction: EmailDirection,
    providerUid: string,
    parsed: ParsedMail,
    internalDate?: Date | string,
  ) {
    const externalMessageId = normalizeMessageId(parsed.messageId);
    const existing = await this.prisma.emailMessage.findFirst({
      where: {
        mailboxConnectionId: mailbox.id,
        OR: [{ folder, providerUid }, ...(externalMessageId ? [{ externalMessageId }] : [])],
      },
      select: { id: true },
    });
    if (existing) return false;
    const references = normalizeReferences(parsed);
    const relatedMessage = references.length
      ? await this.prisma.emailMessage.findFirst({
          where: {
            organizationId: mailbox.organizationId,
            externalMessageId: { in: [...references].reverse() },
          },
          select: { threadId: true, relatedEntityType: true, relatedEntityId: true },
        })
      : null;
    const from = parsed.from?.value.find((entry) => entry.address);
    const fromAddress = normalizeEmail(from?.address) ?? 'unknown@invalid.local';
    const association =
      relatedMessage?.relatedEntityId || direction === EmailDirection.OUTBOUND
        ? {
            relatedEntityType: relatedMessage?.relatedEntityType ?? null,
            relatedEntityId: relatedMessage?.relatedEntityId ?? null,
          }
        : await this.matchCrm(mailbox.organizationId, fromAddress);
    const occurredAt = parsed.date ?? (internalDate ? new Date(internalDate) : new Date());
    const storedKeys: string[] = [];
    try {
      const attachmentData: Array<{
        organizationId: string;
        fileName: string;
        mimeType: string;
        size: number;
        storageKey: string;
        contentId?: string;
      }> = [];
      const maxBytes = this.config.get('MAILBOX_MESSAGE_MAX_BYTES', { infer: true });
      let totalBytes = 0;
      for (const attachment of parsed.attachments) {
        totalBytes += attachment.size;
        if (
          totalBytes > maxBytes ||
          attachment.size < 1 ||
          !ALLOWED_ATTACHMENT_TYPES.has(attachment.contentType) ||
          !this.validAttachmentSignature(attachment.contentType, attachment.content)
        )
          continue;
        const storageKey = crypto.randomUUID();
        await this.storage.put(storageKey, attachment.content, {
          contentType: attachment.contentType,
        });
        storedKeys.push(storageKey);
        attachmentData.push({
          organizationId: mailbox.organizationId,
          fileName: safeFileName(basename(attachment.filename ?? 'attachment')),
          mimeType: attachment.contentType,
          size: attachment.size,
          storageKey,
          contentId: normalizeMessageId(attachment.contentId),
        });
      }
      await this.prisma.$transaction(async (tx) => {
        const thread = relatedMessage?.threadId
          ? await tx.emailThread.findFirst({
              where: { id: relatedMessage.threadId, organizationId: mailbox.organizationId },
            })
          : null;
        const activeThread =
          thread ??
          (await tx.emailThread.create({
            data: {
              organizationId: mailbox.organizationId,
              mailboxConnectionId: mailbox.id,
              relatedEntityType: association.relatedEntityType,
              relatedEntityId: association.relatedEntityId,
              subject: (parsed.subject?.trim() || '(no subject)').slice(0, 300),
              lastMessageAt: occurredAt,
            },
          }));
        const message = await tx.emailMessage.create({
          data: {
            organizationId: mailbox.organizationId,
            mailboxConnectionId: mailbox.id,
            threadId: activeThread.id,
            direction,
            relatedEntityType: activeThread.relatedEntityType,
            relatedEntityId: activeThread.relatedEntityId,
            fromName: (from?.name?.trim() || fromAddress).slice(0, 160),
            fromAddress,
            replyTo: normalizeEmail(parsed.replyTo?.value.find((entry) => entry.address)?.address),
            toAddresses: this.addresses(parsed.to),
            ccAddresses: this.addresses(parsed.cc),
            subject: (parsed.subject?.trim() || '(no subject)').slice(0, 300),
            body: (parsed.text ?? '').slice(0, 50_000),
            externalMessageId,
            inReplyTo: normalizeMessageId(parsed.inReplyTo),
            references,
            providerUid,
            folder: folder.slice(0, 64),
            status: EmailMessageStatus.SENT,
            sentAt: direction === EmailDirection.OUTBOUND ? occurredAt : null,
            receivedAt: direction === EmailDirection.INBOUND ? occurredAt : null,
            attachments: { create: attachmentData },
          },
        });
        await tx.emailThread.update({
          where: { id: activeThread.id },
          data: { lastMessageAt: occurredAt },
        });
        if (direction === EmailDirection.INBOUND && activeThread.relatedEntityId) {
          await tx.activityLog.create({
            data: {
              organizationId: mailbox.organizationId,
              entityType: activeThread.relatedEntityType!,
              entityId: activeThread.relatedEntityId,
              action: 'EMAIL_RECEIVED',
              metadata: {
                emailMessageId: message.id,
                subject: message.subject,
                from: message.fromAddress,
              },
            },
          });
          if (activeThread.relatedEntityType === EmailRelatedEntityType.LEAD)
            await tx.leadActivity.create({
              data: {
                organizationId: mailbox.organizationId,
                leadId: activeThread.relatedEntityId,
                type: 'EMAIL',
                title: 'Email received',
                description: `${message.subject}\nFrom: ${message.fromAddress}`,
                occurredAt,
                metadata: { emailMessageId: message.id },
              },
            });
        }
      });
      return true;
    } catch (error) {
      await Promise.allSettled(storedKeys.map((key) => this.storage.delete(key)));
      if (this.isUnique(error)) return false;
      throw error;
    }
  }

  private async matchCrm(organizationId: string, email: string) {
    const contacts = await this.prisma.contact.findMany({
      where: { organizationId, normalizedEmail: email, archivedAt: null },
      select: { id: true },
      take: 2,
    });
    if (contacts.length === 1)
      return {
        relatedEntityType: EmailRelatedEntityType.CONTACT,
        relatedEntityId: contacts[0]!.id,
      };
    if (contacts.length > 1) return { relatedEntityType: null, relatedEntityId: null };
    const leads = await this.prisma.lead.findMany({
      where: { organizationId, normalizedEmail: email, archivedAt: null },
      select: { id: true },
      take: 2,
    });
    if (leads.length === 1)
      return { relatedEntityType: EmailRelatedEntityType.LEAD, relatedEntityId: leads[0]!.id };
    if (leads.length > 1) return { relatedEntityType: null, relatedEntityId: null };
    const companies = await this.prisma.company.findMany({
      where: { organizationId, email: { equals: email, mode: 'insensitive' }, archivedAt: null },
      select: { id: true },
      take: 2,
    });
    return companies.length === 1
      ? { relatedEntityType: EmailRelatedEntityType.COMPANY, relatedEntityId: companies[0]!.id }
      : { relatedEntityType: null, relatedEntityId: null };
  }

  private addresses(value: ParsedMail['to']) {
    const objects = value ? (Array.isArray(value) ? value : [value]) : [];
    return [
      ...new Set(
        objects
          .flatMap((object) => object.value.map((entry) => normalizeEmail(entry.address)))
          .filter((entry): entry is string => Boolean(entry)),
      ),
    ];
  }

  private requireMailbox(organizationId: string, id: string) {
    return this.prisma.mailboxConnection
      .findFirstOrThrow({ where: { id, organizationId } })
      .catch(() => {
        throw new NotFoundException('Mailbox not found');
      });
  }

  private requireThread(organizationId: string, id: string) {
    return this.prisma.emailThread.findFirstOrThrow({ where: { id, organizationId } }).catch(() => {
      throw new NotFoundException('Email thread not found');
    });
  }

  private async requireEntity(organizationId: string, type: EmailRelatedEntityType, id: string) {
    const where = { id, organizationId, archivedAt: null };
    const entity =
      type === EmailRelatedEntityType.LEAD
        ? await this.prisma.lead.findFirst({ where, select: { id: true } })
        : type === EmailRelatedEntityType.CONTACT
          ? await this.prisma.contact.findFirst({ where, select: { id: true } })
          : await this.prisma.company.findFirst({ where, select: { id: true } });
    if (!entity) throw new NotFoundException('CRM record not found');
  }

  private validateConnection(input: {
    emailAddress: string;
    imapHost: string;
    imapPort: number;
    smtpHost: string;
    smtpPort: number;
  }) {
    this.rejectHeaderInjection(input.emailAddress, input.imapHost, input.smtpHost);
    if (input.imapPort < 1 || input.smtpPort < 1)
      throw new BadRequestException('Mailbox ports must be valid');
  }

  private rejectHeaderInjection(...values: Array<string | undefined>) {
    if (values.some((value) => /[\r\n]/.test(value ?? '')))
      throw new BadRequestException('Mailbox fields cannot contain line breaks');
  }

  private clearConnectionError(id: string) {
    return this.prisma.mailboxConnection.update({
      where: { id },
      data: { status: MailboxConnectionStatus.CONNECTED, safeErrorSummary: null },
    });
  }

  private setConnectionError(id: string, summary: string) {
    return this.prisma.mailboxConnection.update({
      where: { id },
      data: { status: MailboxConnectionStatus.ERROR, safeErrorSummary: summary },
    });
  }

  private createMessageId(emailAddress: string) {
    const domain = emailAddress.split('@')[1]?.replace(/[^a-z0-9.-]/gi, '') || 'unicrm.local';
    return `<${crypto.randomUUID()}@${domain}>`;
  }

  private validAttachmentSignature(mimeType: string, content: Buffer) {
    return (
      mimeType === 'text/plain' ||
      mimeType === 'text/csv' ||
      (mimeType === 'application/pdf' && content.subarray(0, 5).toString() === '%PDF-') ||
      (mimeType === 'image/png' &&
        content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
      (mimeType === 'image/jpeg' &&
        content[0] === 0xff &&
        content[1] === 0xd8 &&
        content[2] === 0xff) ||
      (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' &&
        content[0] === 0x50 &&
        content[1] === 0x4b)
    );
  }

  private isUnique(error: unknown) {
    return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
  }
}
