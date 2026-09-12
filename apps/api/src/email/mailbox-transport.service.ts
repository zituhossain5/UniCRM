import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import type { EnvironmentVariables } from '../config/environment';

export interface MailboxTransportConfig {
  name: string;
  emailAddress: string;
  displayName: string | null;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  username: string;
}

@Injectable()
export class MailboxTransportService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  createImapClient(mailbox: MailboxTransportConfig, credential: string, verifyOnly = false) {
    const timeout = this.config.get('MAILBOX_CONNECTION_TIMEOUT_MS', { infer: true });
    const maxBytes = this.config.get('MAILBOX_MESSAGE_MAX_BYTES', { infer: true });
    return new ImapFlow({
      host: mailbox.imapHost,
      port: mailbox.imapPort,
      secure: mailbox.imapSecure,
      auth: { user: mailbox.username, pass: credential },
      connectionTimeout: timeout,
      greetingTimeout: timeout,
      socketTimeout: Math.max(timeout * 3, 30_000),
      disableAutoIdle: true,
      logger: false,
      verifyOnly,
      tls: { rejectUnauthorized: true },
      maxLiteralSize: maxBytes + 1024 * 1024,
      maxResponseSize: maxBytes + 2 * 1024 * 1024,
    });
  }

  async verifyImap(mailbox: MailboxTransportConfig, credential: string) {
    const client = this.createImapClient(mailbox, credential, true);
    try {
      await client.connect();
    } finally {
      if (!client.isClosed) client.close();
    }
  }

  async verifySmtp(mailbox: MailboxTransportConfig, credential: string) {
    const transporter = this.createSmtpTransport(mailbox, credential);
    try {
      await transporter.verify();
    } finally {
      transporter.close();
    }
  }

  async send(
    mailbox: MailboxTransportConfig,
    credential: string,
    input: {
      to: string[];
      cc: string[];
      subject: string;
      text: string;
      messageId: string;
      inReplyTo?: string;
      references?: string[];
    },
  ) {
    this.rejectHeaderInjection(
      mailbox.emailAddress,
      mailbox.displayName ?? undefined,
      input.subject,
      input.messageId,
      input.inReplyTo,
      ...(input.references ?? []),
    );
    const transporter = this.createSmtpTransport(mailbox, credential);
    try {
      const result = await transporter.sendMail({
        from: { address: mailbox.emailAddress, name: mailbox.displayName ?? mailbox.name },
        to: input.to,
        cc: input.cc,
        subject: input.subject,
        text: input.text,
        messageId: input.messageId,
        inReplyTo: input.inReplyTo,
        references: input.references,
      });
      return { messageId: result.messageId || input.messageId };
    } finally {
      transporter.close();
    }
  }

  private createSmtpTransport(mailbox: MailboxTransportConfig, credential: string) {
    const timeout = this.config.get('MAILBOX_CONNECTION_TIMEOUT_MS', { infer: true });
    return nodemailer.createTransport({
      host: mailbox.smtpHost,
      port: mailbox.smtpPort,
      secure: mailbox.smtpSecure,
      requireTLS: !mailbox.smtpSecure,
      auth: { user: mailbox.username, pass: credential },
      connectionTimeout: timeout,
      greetingTimeout: timeout,
      socketTimeout: Math.max(timeout * 3, 30_000),
      tls: { rejectUnauthorized: true },
    });
  }

  private rejectHeaderInjection(...values: Array<string | undefined>) {
    if (values.some((value) => /[\r\n]/.test(value ?? '')))
      throw new BadRequestException('Email headers cannot contain line breaks');
  }
}
