import { Controller, Get, Inject, Query } from '@nestjs/common';
import { CurrentPrincipal, RequirePermission } from '../auth/auth.decorators';
import { PERMISSIONS } from '../auth/auth.constants';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import { FollowUpListQueryDto } from './dto/leads.dto';
import { LeadsService } from './leads.service';
@Controller('follow-ups')
export class FollowUpsController {
  constructor(@Inject(LeadsService) private readonly leads: LeadsService) {}
  @RequirePermission(PERMISSIONS.activityRead)
  @Get()
  list(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: FollowUpListQueryDto,
  ) {
    return this.leads.listFollowUps(principal, query);
  }
}
