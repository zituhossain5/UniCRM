import {
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../config/environment';
import { DEMO_START_UNAVAILABLE_MESSAGE } from './demo.constants';

type TurnstileResponse = { success?: boolean };

@Injectable()
export class DemoTurnstileService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  async verify(token: string | undefined, ipAddress: string | undefined): Promise<void> {
    if (!this.config.get('DEMO_TURNSTILE_ENABLED', { infer: true })) return;
    if (!token) throw new ForbiddenException('Demo verification failed. Please try again.');

    const body = new URLSearchParams({
      secret: this.config.get('DEMO_TURNSTILE_SECRET', { infer: true }) ?? '',
      response: token,
    });
    if (ipAddress) body.set('remoteip', ipAddress);
    try {
      const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        body,
        method: 'POST',
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) throw new Error('Turnstile unavailable');
      const result = (await response.json()) as TurnstileResponse;
      if (!result.success)
        throw new ForbiddenException('Demo verification failed. Please try again.');
    } catch (cause) {
      if (cause instanceof ForbiddenException) throw cause;
      throw new ServiceUnavailableException(DEMO_START_UNAVAILABLE_MESSAGE);
    }
  }
}
