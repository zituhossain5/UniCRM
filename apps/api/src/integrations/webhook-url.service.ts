import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import type { EnvironmentVariables } from '../config/environment';

function isPrivateIp(address: string): boolean {
  if (
    address === '::1' ||
    address === '::' ||
    address.startsWith('fe80:') ||
    address.startsWith('fc') ||
    address.startsWith('fd')
  )
    return true;
  if (
    address.startsWith('127.') ||
    address.startsWith('10.') ||
    address.startsWith('169.254.') ||
    address.startsWith('192.168.')
  )
    return true;
  const parts = address.split('.').map(Number);
  return parts.length === 4 && parts[0] === 172 && parts[1]! >= 16 && parts[1]! <= 31;
}

@Injectable()
export class WebhookUrlService {
  private readonly production: boolean;

  constructor(@Inject(ConfigService) config: ConfigService<EnvironmentVariables, true>) {
    this.production = config.get('NODE_ENV', { infer: true }) === 'production';
  }

  async validate(target: string): Promise<URL> {
    let url: URL;
    try {
      url = new URL(target);
    } catch {
      throw new BadRequestException('Webhook target URL is invalid');
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
      throw new BadRequestException('Webhook target URL is unsafe');
    if (this.production && url.protocol !== 'https:')
      throw new BadRequestException('Webhook targets must use HTTPS in production');
    if (this.production) {
      const addresses = isIP(url.hostname)
        ? [{ address: url.hostname }]
        : await lookup(url.hostname, { all: true, verbatim: true }).catch(() => []);
      if (!addresses.length || addresses.some(({ address }) => isPrivateIp(address)))
        throw new BadRequestException(
          'Webhook target resolves to a private or unavailable network address',
        );
    }
    return url;
  }
}
