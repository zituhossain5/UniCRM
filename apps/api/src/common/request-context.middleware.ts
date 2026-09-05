import { Inject, Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Response } from 'express';
import type { EnvironmentVariables } from '../config/environment';
import type { RequestWithContext } from './request-context';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  use(request: RequestWithContext, response: Response, next: NextFunction): void {
    const configuredHeader = this.config.get('REQUEST_ID_HEADER', { infer: true }).toLowerCase();
    const inbound = request.header(configuredHeader);
    const requestId =
      inbound && /^[a-zA-Z0-9._:-]{8,128}$/.test(inbound) ? inbound : crypto.randomUUID();

    request.requestId = requestId;
    response.setHeader(configuredHeader, requestId);
    next();
  }
}
