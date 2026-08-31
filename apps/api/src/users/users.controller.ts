import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentPrincipal, Public, RequirePermission } from '../auth/auth.decorators';
import { PERMISSIONS } from '../auth/auth.constants';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import { requestMetadata } from '../auth/auth.types';
import { AcceptInvitationDto, InviteUserDto, UpdateUserDto } from './dto/users.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}

  @RequirePermission(PERMISSIONS.userInvite)
  @Post('invitations')
  async invite(
    @Body() dto: InviteUserDto,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: Request,
  ) {
    return { data: await this.users.invite(principal, dto, requestMetadata(request)) };
  }

  @Public()
  @Get('invitations/:token/validate')
  async validateInvitation(@Param('token') token: string, @Req() request: Request) {
    return { data: await this.users.validateInvitation(token, requestMetadata(request)) };
  }

  @Public()
  @Post('invitations/:token/accept')
  @HttpCode(204)
  async acceptInvitation(
    @Param('token') token: string,
    @Body() dto: AcceptInvitationDto,
    @Req() request: Request,
  ) {
    await this.users.acceptInvitation(token, dto.password, requestMetadata(request));
  }

  @RequirePermission(PERMISSIONS.userRead)
  @Get()
  async list(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return { data: await this.users.list(principal) };
  }

  @RequirePermission(PERMISSIONS.userRead)
  @Get(':id')
  async get(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.users.get(principal, id) };
  }

  @RequirePermission(PERMISSIONS.userUpdate)
  @Patch(':id')
  async update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @Req() request: Request,
  ) {
    return { data: await this.users.update(principal, id, dto, requestMetadata(request)) };
  }
}
