import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import type { CreateRoleDto, UpdateRoleDto } from './roles.dto';

const roleInclude = {
  rolePermissions: { include: { permission: true } },
  _count: { select: { userRoles: true } },
} as const;

@Injectable()
export class RolesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  list(principal: AuthenticatedPrincipal) {
    return this.prisma.role.findMany({
      where: { organizationId: principal.organizationId },
      orderBy: { name: 'asc' },
      include: roleInclude,
    });
  }

  permissions() {
    return this.prisma.permission.findMany({ orderBy: { key: 'asc' } });
  }

  async create(principal: AuthenticatedPrincipal, dto: CreateRoleDto) {
    const permissions = await this.resolvePermissions(dto.permissionKeys);
    return this.prisma.role.create({
      data: {
        description: dto.description?.trim(),
        name: dto.name.trim(),
        organizationId: principal.organizationId,
        rolePermissions: { create: permissions.map(({ id }) => ({ permissionId: id })) },
      },
      include: roleInclude,
    });
  }

  async update(principal: AuthenticatedPrincipal, roleId: string, dto: UpdateRoleDto) {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, organizationId: principal.organizationId },
    });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem) throw new ConflictException('Default roles cannot be modified');
    const permissions = dto.permissionKeys
      ? await this.resolvePermissions(dto.permissionKeys)
      : undefined;
    await this.prisma.$transaction(async (tx) => {
      await tx.role.update({
        where: { id: roleId },
        data: { description: dto.description?.trim(), name: dto.name?.trim() },
      });
      if (permissions) {
        await tx.rolePermission.deleteMany({ where: { roleId } });
        await tx.rolePermission.createMany({
          data: permissions.map(({ id }) => ({ permissionId: id, roleId })),
          skipDuplicates: true,
        });
      }
    });
    return this.prisma.role.findUniqueOrThrow({ where: { id: roleId }, include: roleInclude });
  }

  private async resolvePermissions(keys: string[]) {
    const uniqueKeys = [...new Set(keys)];
    const permissions = await this.prisma.permission.findMany({
      where: { key: { in: uniqueKeys } },
    });
    if (permissions.length !== uniqueKeys.length)
      throw new NotFoundException('One or more permissions do not exist');
    return permissions;
  }
}
