import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class AuthMaintenanceService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async cleanupExpiredCredentials(now = new Date()) {
    const [sessions, resets, invitations] = await this.prisma.$transaction([
      this.prisma.authSession.deleteMany({
        where: { OR: [{ expiresAt: { lt: now } }, { revokedAt: { not: null } }] },
      }),
      this.prisma.passwordResetToken.deleteMany({
        where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] },
      }),
      this.prisma.userInvitation.deleteMany({
        where: { acceptedAt: { not: null } },
      }),
    ]);

    return {
      invitationsDeleted: invitations.count,
      passwordResetTokensDeleted: resets.count,
      sessionsDeleted: sessions.count,
    };
  }
}
