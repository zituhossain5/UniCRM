import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import type { RequestWithContext } from './request-context';

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(request: RequestWithContext, response: Response, next: NextFunction): void {
    const startedAt = process.hrtime.bigint();
    response.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const payload = {
        durationMs: Math.round(durationMs),
        method: request.method,
        organizationId: request.auth?.organizationId,
        path: request.originalUrl,
        requestId: request.requestId,
        statusCode: response.statusCode,
        userId: request.auth?.userId,
      };
      const message = JSON.stringify(payload);
      if (response.statusCode >= 500) this.logger.error(message);
      else if (response.statusCode >= 400) this.logger.warn(message);
      else this.logger.log(message);
    });
    next();
  }
}
