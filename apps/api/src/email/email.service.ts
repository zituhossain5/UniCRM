import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import type { EnvironmentVariables } from '../config/environment';

export interface EmailMessage {
  id: string;
  to: string;
  subject: string;
  text: string;
  createdAt: string;
}

@Injectable()
export class EmailService {
  private readonly outbox: EmailMessage[] = [];
  private readonly transporter?: Transporter;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {
    if (config.get('EMAIL_TRANSPORT', { infer: true }) === 'smtp') {
      this.transporter = nodemailer.createTransport({
        host: config.get('SMTP_HOST', { infer: true }),
        port: config.get('SMTP_PORT', { infer: true }),
        secure: config.get('SMTP_SECURE', { infer: true }),
        auth: config.get('SMTP_USER', { infer: true })
          ? {
              user: config.get('SMTP_USER', { infer: true }),
              pass: config.get('SMTP_PASSWORD', { infer: true }),
            }
          : undefined,
      });
    }
  }

  async send(input: Omit<EmailMessage, 'id' | 'createdAt'>): Promise<void> {
    if (this.transporter) {
      await this.transporter.sendMail({
        from: this.config.get('EMAIL_FROM', { infer: true }),
        ...input,
      });
      return;
    }
    this.outbox.unshift({ ...input, createdAt: new Date().toISOString(), id: crypto.randomUUID() });
    this.outbox.splice(50);
  }

  readDevelopmentOutbox(key: string | undefined): EmailMessage[] {
    if (this.config.get('NODE_ENV', { infer: true }) === 'production')
      throw new NotFoundException();
    if (!key || key !== this.config.get('DEV_EMAIL_KEY', { infer: true })) {
      throw new ForbiddenException('Invalid development email key');
    }
    return this.outbox;
  }
}
