import { Inject, Injectable } from '@nestjs/common';
import { DEFAULT_ROLES, DEFAULT_ROLE_PERMISSIONS, PERMISSION_CATALOG } from './auth/auth.constants';
import { PasswordService } from './auth/password.service';
import { PrismaService } from './database/prisma.service';
import { DEFAULT_STAGES } from './pipelines/pipelines.service';

@Injectable()
export class IdentityBootstrapService {
  constructor(
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async run(input: {
    organizationName: string;
    organizationSlug: string;
    adminEmail: string;
    adminPassword: string;
    adminFirstName: string;
    adminLastName: string;
  }): Promise<{ organizationCreated: boolean; ownerCreated: boolean }> {
    if (input.adminPassword.length < 12)
      throw new Error('Bootstrap password must be at least 12 characters');
    const email = input.adminEmail.trim().toLowerCase();
    const existingOrganization = await this.prisma.organization.findUnique({
      where: { slug: input.organizationSlug },
    });
    const existingOwner = await this.prisma.user.findUnique({ where: { normalizedEmail: email } });
    if (
      existingOwner &&
      existingOrganization &&
      existingOwner.organizationId !== existingOrganization.id
    ) {
      throw new Error('Bootstrap email already belongs to another organization');
    }
    const passwordHash = existingOwner ? undefined : await this.passwords.hash(input.adminPassword);

    return this.prisma.$transaction(async (tx) => {
      const organization =
        existingOrganization ??
        (await tx.organization.create({
          data: { name: input.organizationName.trim(), slug: input.organizationSlug },
        }));

      await tx.permission.createMany({ data: [...PERMISSION_CATALOG], skipDuplicates: true });
      const permissions = await tx.permission.findMany();
      const permissionIds = new Map(
        permissions.map((permission) => [permission.key, permission.id]),
      );

      const roleIds = new Map<string, string>();
      for (const roleName of DEFAULT_ROLES) {
        const role = await tx.role.upsert({
          where: { organizationId_name: { organizationId: organization.id, name: roleName } },
          create: { isSystem: true, name: roleName, organizationId: organization.id },
          update: { isSystem: true },
        });
        roleIds.set(roleName, role.id);
      }
      const rolePermissions = DEFAULT_ROLES.flatMap((roleName) => {
        const roleId = roleIds.get(roleName);
        if (!roleId) return [];
        return DEFAULT_ROLE_PERMISSIONS[roleName].flatMap((key) => {
          const permissionId = permissionIds.get(key);
          return permissionId ? [{ roleId, permissionId }] : [];
        });
      });
      await tx.rolePermission.createMany({ data: rolePermissions, skipDuplicates: true });

      const defaultPipeline = await tx.pipeline.findFirst({
        where: { organizationId: organization.id, isDefault: true, archivedAt: null },
      });
      if (!defaultPipeline) {
        const firstPipeline = await tx.pipeline.findFirst({
          where: { organizationId: organization.id, archivedAt: null },
          orderBy: { createdAt: 'asc' },
        });
        if (firstPipeline) {
          await tx.pipeline.update({ where: { id: firstPipeline.id }, data: { isDefault: true } });
        } else {
          await tx.pipeline.create({
            data: {
              isDefault: true,
              name: 'Sales Pipeline',
              organizationId: organization.id,
              stages: {
                create: DEFAULT_STAGES.map((stage) => ({
                  ...stage,
                  organizationId: organization.id,
                })),
              },
            },
          });
        }
      }

      if (existingOwner) return { organizationCreated: !existingOrganization, ownerCreated: false };
      const ownerRole = await tx.role.findUniqueOrThrow({
        where: { organizationId_name: { organizationId: organization.id, name: 'Owner' } },
      });
      const owner = await tx.user.create({
        data: {
          email,
          emailVerifiedAt: new Date(),
          firstName: input.adminFirstName.trim(),
          lastName: input.adminLastName.trim(),
          normalizedEmail: email,
          organizationId: organization.id,
          passwordHash,
          status: 'ACTIVE',
        },
      });
      await tx.userRole.create({ data: { roleId: ownerRole.id, userId: owner.id } });
      return { organizationCreated: !existingOrganization, ownerCreated: true };
    });
  }
}
