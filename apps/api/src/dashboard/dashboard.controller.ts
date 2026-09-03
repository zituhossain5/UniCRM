import { Controller, Get, Inject } from '@nestjs/common';
import { CurrentPrincipal, RequirePermission } from '../auth/auth.decorators';
import { PERMISSIONS } from '../auth/auth.constants';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@RequirePermission(PERMISSIONS.dashboardRead)
export class DashboardController {
  constructor(@Inject(DashboardService) private readonly dashboard: DashboardService) {}

  @Get('summary')
  summary(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.dashboard.summary(principal);
  }

  @Get('my-tasks')
  async tasks(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return { data: await this.dashboard.myTasks(principal) };
  }

  @Get('follow-ups')
  async followUps(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return { data: await this.dashboard.followUps(principal) };
  }

  @Get('recent-activity')
  async activity(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return { data: await this.dashboard.recentActivity(principal) };
  }
}
