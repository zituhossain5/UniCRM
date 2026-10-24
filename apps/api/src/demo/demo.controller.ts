import { Controller, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../auth/auth.decorators';
import { requestMetadata } from '../auth/auth.types';
import { CookieService } from '../auth/cookie.service';
import { DemoService } from './demo.service';

@Controller('demo')
export class DemoController {
  constructor(
    @Inject(DemoService) private readonly demo: DemoService,
    @Inject(CookieService) private readonly cookies: CookieService,
  ) {}

  @Public()
  @Post('start')
  @HttpCode(201)
  async start(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.demo.start(requestMetadata(request));
    this.cookies.set(response, result.sessionToken, result.csrfToken);
    return { data: { expiresAt: result.expiresAt } };
  }
}
