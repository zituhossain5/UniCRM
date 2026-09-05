import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthMaintenanceService } from './auth-maintenance.service';
import { AuthService } from './auth.service';
import { CookieService } from './cookie.service';
import { PasswordService } from './password.service';
import { RateLimitService } from './rate-limit.service';
import { SecurityEventsService } from './security-events.service';
import { TokenService } from './token.service';

@Module({
  controllers: [AuthController],
  exports: [
    AuthMaintenanceService,
    CookieService,
    PasswordService,
    RateLimitService,
    SecurityEventsService,
    TokenService,
  ],
  providers: [
    AuthMaintenanceService,
    AuthService,
    CookieService,
    PasswordService,
    RateLimitService,
    SecurityEventsService,
    TokenService,
  ],
})
export class AuthModule {}
