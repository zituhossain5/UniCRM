import { Body, Controller, Get, Inject, Patch } from '@nestjs/common';
import { CurrentPrincipal, RequirePermission } from '../auth/auth.decorators';
import { PERMISSIONS } from '../auth/auth.constants';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { UpdateOrganizationDto } from './organizations.dto';

@Controller('organization')
export class OrganizationsController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @RequirePermission(PERMISSIONS.settingsRead)
  @Get()
  async get(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return {
      data: await this.prisma.organization.findUniqueOrThrow({
        where: { id: principal.organizationId },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    };
  }

  @RequirePermission(PERMISSIONS.settingsUpdate)
  @Patch()
  async update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return {
      data: await this.prisma.organization.update({
        where: { id: principal.organizationId },
        data: { name: dto.name.trim() },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    };
  }
}
