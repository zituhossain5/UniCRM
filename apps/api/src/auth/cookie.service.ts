import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { EnvironmentVariables } from '../config/environment';

@Injectable()
export class CookieService {
  readonly csrfCookieName: string;
  readonly sessionCookieName: string;
  private readonly secure: boolean;
  private readonly ttlMs: number;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.csrfCookieName = config.get('CSRF_COOKIE_NAME', { infer: true });
    this.sessionCookieName = config.get('SESSION_COOKIE_NAME', { infer: true });
    this.secure = config.get('SESSION_COOKIE_SECURE', { infer: true });
    this.ttlMs = config.get('SESSION_TTL_SECONDS', { infer: true }) * 1000;
  }

  set(response: Response, sessionToken: string, csrfToken: string): void {
    const common = { maxAge: this.ttlMs, path: '/', sameSite: 'lax' as const, secure: this.secure };
    response.cookie(this.sessionCookieName, sessionToken, { ...common, httpOnly: true });
    response.cookie(this.csrfCookieName, csrfToken, { ...common, httpOnly: false });
  }

  clear(response: Response): void {
    const common = { path: '/', sameSite: 'lax' as const, secure: this.secure };
    response.clearCookie(this.sessionCookieName, { ...common, httpOnly: true });
    response.clearCookie(this.csrfCookieName, { ...common, httpOnly: false });
  }
}
