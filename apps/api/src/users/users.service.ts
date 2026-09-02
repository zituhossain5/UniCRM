import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../config/environment';
import { PrismaService } from '../database/prisma.service';
import { EmailService } from '../email/email.service';
import type { AuthenticatedPrincipal, RequestMetadata } from '../auth/auth.types';
import { PERMISSIONS } from '../auth/auth.constants';
import { PasswordService } from '../auth/password.service';
import { RateLimitService } from '../auth/rate-limit.service';
import { TokenService } from '../auth/token.service';
import type { InviteUserDto, UpdateUserDto } from './dto/users.dto';

const safeUserSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  status: true,
  emailVerifiedAt: true,
  lastLoginAt: true,
  createdAt: true,
  userRoles: { select: { role: { select: { id: true, name: true } } } },
} as const;

@Injectable()
export class UsersService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<EnvironmentVariables, true>,
    @Inject(EmailService) private readonly email: EmailService,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RateLimitService) private readonly rateLimit: RateLimitService,
    @Inject(TokenService) private readonly tokens: TokenService,
  ) {}

  async list(principal: AuthenticatedPrincipal) {
    const users = await this.prisma.user.findMany({
      where: { organizationId: principal.organizationId },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      select: safeUserSelect,
    });
    const invitations = await this.prisma.userInvitation.findMany({
      where: {
        organizationId: principal.organizationId,
        acceptedAt: null,
        normalizedEmail: {
          in: users
            .filter(({ status }) => status === 'INVITED')
            .map(({ email }) => email.toLowerCase()),
        },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        createdAt: true,
        expiresAt: true,
        normalizedEmail: true,
        role: { select: { id: true, name: true } },
      },
    });
    const byEmail = new Map(
      invitations.map((invitation) => [invitation.normalizedEmail, invitation]),
    );
    return users.map((user) => ({
      ...user,
      invitation: byEmail.get(user.email.toLowerCase()) ?? null,
    }));
  }

  async get(principal: AuthenticatedPrincipal, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId: principal.organizationId },
      select: safeUserSelect,
    });
    if (!user) throw new NotFoundException('User not found');
    const invitation =
      user.status === 'INVITED'
        ? await this.prisma.userInvitation.findFirst({
            where: {
              organizationId: principal.organizationId,
              normalizedEmail: user.email.toLowerCase(),
              acceptedAt: null,
            },
            orderBy: { createdAt: 'desc' },
            select: {
              createdAt: true,
              expiresAt: true,
              role: { select: { id: true, name: true } },
            },
          })
        : null;
    return { ...user, invitation };
  }

  async update(
    principal: AuthenticatedPrincipal,
    userId: string,
    dto: UpdateUserDto,
    request: RequestMetadata,
  ) {
    const existingUser = await this.get(principal, userId);
    if (dto.status && !principal.permissions.includes(PERMISSIONS.userDisable)) {
      throw new ForbiddenException('Insufficient permission to change account status');
    }
    if (dto.status && userId === principal.userId && dto.status !== 'ACTIVE') {
      throw new ConflictException('You cannot suspend or disable your own account');
    }
    if (dto.status === 'ACTIVE' && existingUser.status === 'INVITED') {
      throw new ConflictException('Invited users must accept their invitation before activation');
    }
    if (dto.status && existingUser.status === 'INVITED') {
      throw new ConflictException('Invited users must accept or cancel their invitation');
    }
    if (dto.roleId && existingUser.status === 'INVITED') {
      throw new ConflictException('Cancel and send a new invitation to change the invited role');
    }
    if (dto.roleId && !principal.permissions.includes(PERMISSIONS.roleManage)) {
      throw new ForbiddenException('Insufficient permission to assign roles');
    }
    if (dto.roleId) {
      const role = await this.prisma.role.findFirst({
        where: { id: dto.roleId, organizationId: principal.organizationId },
      });
      if (!role) throw new NotFoundException('Role not found');
    }

    const { roleId, ...userData } = dto;
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: userData });
      if (roleId) {
        await tx.userRole.deleteMany({ where: { userId } });
        await tx.userRole.create({ data: { roleId, userId } });
        await tx.securityEvent.create({
          data: {
            eventType: 'ROLE_CHANGED',
            ipAddress: request.ipAddress,
            metadata: { roleId, targetUserId: userId },
            organizationId: principal.organizationId,
            userAgent: request.userAgent,
            userId: principal.userId,
          },
        });
      }
      if (dto.status === 'DISABLED' || dto.status === 'SUSPENDED') {
        await tx.authSession.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await tx.securityEvent.create({
          data: {
            eventType: 'ACCOUNT_DISABLED',
            ipAddress: request.ipAddress,
            metadata: { status: dto.status, targetUserId: userId },
            organizationId: principal.organizationId,
            userAgent: request.userAgent,
            userId: principal.userId,
          },
        });
      }
    });
    return this.get(principal, userId);
  }

  async invite(principal: AuthenticatedPrincipal, dto: InviteUserDto, request: RequestMetadata) {
    const role = await this.prisma.role.findFirst({
      where: { id: dto.roleId, organizationId: principal.organizationId },
    });
    if (!role) throw new NotFoundException('Role not found');
    if (await this.prisma.user.findUnique({ where: { normalizedEmail: dto.email } })) {
      throw new ConflictException('A user with this email already exists');
    }

    const rawToken = this.tokens.generate();
    const expiresAt = new Date(
      Date.now() + this.config.get('INVITATION_TTL_SECONDS', { infer: true }) * 1000,
    );
    const invitation = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          normalizedEmail: dto.email,
          organizationId: principal.organizationId,
          status: 'INVITED',
        },
      });
      const created = await tx.userInvitation.create({
        data: {
          email: dto.email,
          expiresAt,
          firstName: dto.firstName.trim(),
          invitedById: principal.userId,
          lastName: dto.lastName.trim(),
          normalizedEmail: dto.email,
          organizationId: principal.organizationId,
          roleId: role.id,
          tokenHash: this.tokens.hash(rawToken),
        },
      });
      await tx.securityEvent.create({
        data: {
          eventType: 'USER_INVITED',
          ipAddress: request.ipAddress,
          metadata: { invitedUserId: user.id, roleId: role.id },
          organizationId: principal.organizationId,
          userAgent: request.userAgent,
          userId: principal.userId,
        },
      });
      return created;
    });
    const invitationUrl = `${this.config.get('APP_URL', { infer: true })}/invitation?token=${encodeURIComponent(rawToken)}`;
    await this.email.send({
      to: dto.email,
      subject: 'You are invited to UniCRM',
      text: `Accept your invitation: ${invitationUrl}`,
    });
    return {
      id: invitation.id,
      email: invitation.email,
      expiresAt: invitation.expiresAt,
    };
  }

  async resendInvitation(
    principal: AuthenticatedPrincipal,
    userId: string,
    request: RequestMetadata,
  ) {
    const user = await this.requireInvitedUser(principal, userId);
    const invitation = await this.prisma.userInvitation.findFirst({
      where: {
        organizationId: principal.organizationId,
        normalizedEmail: user.email.toLowerCase(),
        acceptedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!invitation) throw new ConflictException('No pending invitation exists for this user');

    const rawToken = this.tokens.generate();
    const expiresAt = new Date(
      Date.now() + this.config.get('INVITATION_TTL_SECONDS', { infer: true }) * 1000,
    );
    await this.prisma.$transaction(async (tx) => {
      const rotated = await tx.userInvitation.updateMany({
        where: { id: invitation.id, acceptedAt: null },
        data: {
          expiresAt,
          invitedById: principal.userId,
          tokenHash: this.tokens.hash(rawToken),
        },
      });
      if (!rotated.count) throw new ConflictException('Invitation is no longer pending');
      await tx.securityEvent.create({
        data: {
          eventType: 'INVITATION_RESENT',
          ipAddress: request.ipAddress,
          metadata: { invitedUserId: user.id, invitationId: invitation.id },
          organizationId: principal.organizationId,
          userAgent: request.userAgent,
          userId: principal.userId,
        },
      });
    });
    const invitationUrl = `${this.config.get('APP_URL', { infer: true })}/invitation?token=${encodeURIComponent(rawToken)}`;
    await this.email.send({
      to: user.email,
      subject: 'Your UniCRM invitation',
      text: `Accept your invitation: ${invitationUrl}`,
    });
    return { id: invitation.id, email: user.email, expiresAt };
  }

  async cancelInvitation(
    principal: AuthenticatedPrincipal,
    userId: string,
    request: RequestMetadata,
  ): Promise<void> {
    const user = await this.requireInvitedUser(principal, userId);
    await this.prisma.$transaction(async (tx) => {
      const removed = await tx.userInvitation.deleteMany({
        where: {
          organizationId: principal.organizationId,
          normalizedEmail: user.email.toLowerCase(),
          acceptedAt: null,
        },
      });
      if (!removed.count) throw new ConflictException('Invitation is no longer pending');
      const removedUser = await tx.user.deleteMany({
        where: { id: user.id, organizationId: principal.organizationId, status: 'INVITED' },
      });
      if (!removedUser.count) throw new ConflictException('Invitation is no longer pending');
      await tx.securityEvent.create({
        data: {
          eventType: 'INVITATION_CANCELLED',
          ipAddress: request.ipAddress,
          metadata: { email: user.email, invitedUserId: user.id },
          organizationId: principal.organizationId,
          userAgent: request.userAgent,
          userId: principal.userId,
        },
      });
    });
  }

  async validateInvitation(rawToken: string, request: RequestMetadata) {
    await this.rateLimit.consume('invitation', request.ipAddress ?? 'unknown');
    const invitation = await this.prisma.userInvitation.findUnique({
      where: { tokenHash: this.tokens.hash(rawToken) },
      include: { organization: { select: { name: true } }, role: { select: { name: true } } },
    });
    if (!invitation || invitation.acceptedAt || invitation.expiresAt <= new Date()) {
      throw new UnauthorizedException('Invalid or expired invitation');
    }
    return {
      email: invitation.email,
      firstName: invitation.firstName,
      lastName: invitation.lastName,
      organizationName: invitation.organization.name,
      role: invitation.role.name,
      expiresAt: invitation.expiresAt,
    };
  }

  async acceptInvitation(
    rawToken: string,
    password: string,
    request: RequestMetadata,
  ): Promise<void> {
    await this.rateLimit.consume('invitation', request.ipAddress ?? 'unknown');
    const invitation = await this.prisma.userInvitation.findUnique({
      where: { tokenHash: this.tokens.hash(rawToken) },
    });
    if (!invitation || invitation.acceptedAt || invitation.expiresAt <= new Date()) {
      throw new UnauthorizedException('Invalid or expired invitation');
    }
    const user = await this.prisma.user.findUnique({
      where: { normalizedEmail: invitation.normalizedEmail },
    });
    if (!user || user.organizationId !== invitation.organizationId || user.status !== 'INVITED') {
      throw new UnauthorizedException('Invalid or expired invitation');
    }
    const passwordHash = await this.passwords.hash(password);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.userInvitation.updateMany({
        where: {
          id: invitation.id,
          tokenHash: this.tokens.hash(rawToken),
          acceptedAt: null,
          expiresAt: { gt: now },
        },
        data: { acceptedAt: now },
      });
      if (!consumed.count) throw new UnauthorizedException('Invalid or expired invitation');
      await tx.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: now, passwordHash, status: 'ACTIVE' },
      });
      await tx.userRole.create({ data: { roleId: invitation.roleId, userId: user.id } });
      await tx.securityEvent.create({
        data: {
          eventType: 'INVITATION_ACCEPTED',
          ipAddress: request.ipAddress,
          organizationId: invitation.organizationId,
          userAgent: request.userAgent,
          userId: user.id,
        },
      });
    });
  }

  private async requireInvitedUser(principal: AuthenticatedPrincipal, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId: principal.organizationId },
      select: { id: true, email: true, status: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.status !== 'INVITED')
      throw new ConflictException('User is not awaiting an invitation');
    return user;
  }
}
