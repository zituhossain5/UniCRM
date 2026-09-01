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

      for (const permission of PERMISSION_CATALOG) {
        await tx.permission.upsert({
          where: { key: permission.key },
          create: permission,
          update: { description: permission.description },
        });
      }
      const permissions = await tx.permission.findMany();
      const permissionIds = new Map(
        permissions.map((permission) => [permission.key, permission.id]),
      );

      for (const roleName of DEFAULT_ROLES) {
        const role = await tx.role.upsert({
          where: { organizationId_name: { organizationId: organization.id, name: roleName } },
          create: { isSystem: true, name: roleName, organizationId: organization.id },
          update: { isSystem: true },
        });
        for (const key of DEFAULT_ROLE_PERMISSIONS[roleName]) {
          const permissionId = permissionIds.get(key);
          if (permissionId) {
            await tx.rolePermission.upsert({
              where: { roleId_permissionId: { roleId: role.id, permissionId } },
              create: { roleId: role.id, permissionId },
              update: {},
            });
          }
        }
      }

      const pipeline = await tx.pipeline.upsert({
        where: {
          organizationId_name: { organizationId: organization.id, name: 'Sales Pipeline' },
        },
        create: { isDefault: true, name: 'Sales Pipeline', organizationId: organization.id },
        update: { isDefault: true },
      });
      for (const stage of DEFAULT_STAGES) {
        await tx.pipelineStage.upsert({
          where: { pipelineId_name: { pipelineId: pipeline.id, name: stage.name } },
          create: { ...stage, organizationId: organization.id, pipelineId: pipeline.id },
          update: { isLost: stage.isLost, isWon: stage.isWon, position: stage.position },
        });
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
