import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { CurrentPrincipal, RequirePermission } from '../auth/auth.decorators';
import { PERMISSIONS } from '../auth/auth.constants';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import { CreateRoleDto, UpdateRoleDto } from './roles.dto';
import { RolesService } from './roles.service';

@Controller('roles')
export class RolesController {
  constructor(@Inject(RolesService) private readonly roles: RolesService) {}

  @RequirePermission(PERMISSIONS.roleRead)
  @Get()
  async list(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return { data: await this.roles.list(principal) };
  }

  @RequirePermission(PERMISSIONS.roleManage)
  @Post()
  async create(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Body() dto: CreateRoleDto) {
    return { data: await this.roles.create(principal, dto) };
  }

  @RequirePermission(PERMISSIONS.roleManage)
  @Patch(':id')
  async update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return { data: await this.roles.update(principal, id, dto) };
  }
}

@Controller('permissions')
export class PermissionsController {
  constructor(@Inject(RolesService) private readonly roles: RolesService) {}

  @RequirePermission(PERMISSIONS.roleRead)
  @Get()
  async list() {
    return { data: await this.roles.permissions() };
  }
}
