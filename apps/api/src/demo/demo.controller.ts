import {
  Body,
  Controller,
  HttpCode,
  Inject,
  PayloadTooLargeException,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { CurrentPrincipal, Public } from '../auth/auth.decorators';
import { requestMetadata, type AuthenticatedPrincipal } from '../auth/auth.types';
import { CookieService } from '../auth/cookie.service';
import { DemoService } from './demo.service';
import type { EnvironmentVariables } from '../config/environment';
import { StartDemoDto } from './dto/start-demo.dto';

@Controller('demo')
export class DemoController {
  constructor(
    @Inject(DemoService) private readonly demo: DemoService,
    @Inject(CookieService) private readonly cookies: CookieService,
    @Inject(ConfigService) private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  @Public()
  @Post('start')
  @HttpCode(201)
  async start(
    @Body() body: StartDemoDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const contentLength = Number(request.get('content-length') ?? 0);
    const rawBodyLength = (request as Request & { rawBody?: Buffer }).rawBody?.byteLength ?? 0;
    if (
      Math.max(contentLength, rawBodyLength) >
      this.config.get('DEMO_START_MAX_BODY_BYTES', { infer: true })
    ) {
      throw new PayloadTooLargeException('Demo start request is too large');
    }
    const existingSession = (request.cookies as Record<string, string> | undefined)?.[
      this.cookies.sessionCookieName
    ];
    const result = await this.demo.start(
      requestMetadata(request),
      body.turnstileToken,
      existingSession,
    );
    this.cookies.set(response, result.sessionToken, result.csrfToken);
    return { data: { expiresAt: result.expiresAt } };
  }

  @Post('restart')
  @HttpCode(201)
  async restart(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.demo.restart(principal, requestMetadata(request));
    this.cookies.set(response, result.sessionToken, result.csrfToken);
    return { data: { expiresAt: result.expiresAt } };
  }
}
