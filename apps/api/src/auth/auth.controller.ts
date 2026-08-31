import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentPrincipal, Public, RequirePermission } from './auth.decorators';
import { PERMISSIONS } from './auth.constants';
import { AuthService } from './auth.service';
import type { AuthenticatedPrincipal } from './auth.types';
import { requestMetadata } from './auth.types';
import { CookieService } from './cookie.service';
import { ForgotPasswordDto, LoginDto, LogoutAllDto, ResetPasswordDto } from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(CookieService) private readonly cookies: CookieService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(dto.email, dto.password, requestMetadata(request));
    this.cookies.set(response, result.sessionToken, result.csrfToken);
    return { data: result.data };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logout(principal, requestMetadata(request));
    this.cookies.clear(response);
  }

  @Get('me')
  async me(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return { data: await this.auth.currentUser(principal) };
  }

  @RequirePermission(PERMISSIONS.securitySessionsRead)
  @Get('sessions')
  async sessions(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return { data: await this.auth.sessions(principal) };
  }

  @RequirePermission(PERMISSIONS.securitySessionsRevoke)
  @Delete('sessions/:sessionId')
  @HttpCode(204)
  async revoke(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (await this.auth.revokeSession(principal, sessionId, requestMetadata(request)))
      this.cookies.clear(response);
  }

  @RequirePermission(PERMISSIONS.securitySessionsRevoke)
  @Post('logout-all')
  @HttpCode(204)
  async logoutAll(
    @Body() dto: LogoutAllDto,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logoutAll(principal, dto.exceptCurrent ?? false, requestMetadata(request));
    if (!dto.exceptCurrent) this.cookies.clear(response);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(202)
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() request: Request) {
    await this.auth.forgotPassword(dto.email, requestMetadata(request));
    return { message: 'If the account exists, password reset instructions have been sent.' };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(204)
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() request: Request) {
    await this.auth.resetPassword(dto.token, dto.password, requestMetadata(request));
  }
}
