import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { EnvironmentVariables } from '../config/environment';

@Injectable()
export class IntegrationSecretService {
  private readonly key: Buffer;

  constructor(@Inject(ConfigService) config: ConfigService<EnvironmentVariables, true>) {
    const configured = config.get('INTEGRATION_SECRET_ENCRYPTION_KEY', { infer: true });
    this.key = configured
      ? Buffer.from(configured, 'base64')
      : createHash('sha256')
          .update(config.get('DEV_EMAIL_KEY', { infer: true }))
          .update('unicrm-integration-secrets-v1')
          .digest();
  }

  encrypt(secret: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    return [
      'v1',
      iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      encrypted.toString('base64'),
    ].join('.');
  }

  decrypt(value: string): string {
    const [version, iv, tag, encrypted] = value.split('.');
    if (version !== 'v1' || !iv || !tag || !encrypted)
      throw new Error('Invalid encrypted integration secret');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}
