import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentPrincipal, RequirePermission } from '../auth/auth.decorators';
import { PERMISSIONS } from '../auth/auth.constants';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import { ActivitiesService } from './activities.service';
import {
  ActivityListQueryDto,
  CreateScheduledActivityDto,
  UpdateScheduledActivityDto,
} from './dto/activities.dto';

@Controller('activities')
export class ActivitiesController {
  constructor(@Inject(ActivitiesService) private readonly activities: ActivitiesService) {}

  @RequirePermission(PERMISSIONS.activityRead)
  @Get()
  list(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: ActivityListQueryDto,
  ) {
    return this.activities.list(principal, query);
  }

  @RequirePermission(PERMISSIONS.activityRead)
  @Get(':id')
  async get(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.activities.get(principal, id) };
  }

  @RequirePermission(PERMISSIONS.activityCreate)
  @Post()
  async create(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: CreateScheduledActivityDto,
  ) {
    return { data: await this.activities.create(principal, dto) };
  }

  @RequirePermission(PERMISSIONS.activityUpdate)
  @Patch(':id')
  async update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateScheduledActivityDto,
  ) {
    return { data: await this.activities.update(principal, id, dto) };
  }

  @RequirePermission(PERMISSIONS.activityUpdate)
  @Post(':id/complete')
  async complete(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.activities.changeStatus(principal, id, 'COMPLETED') };
  }

  @RequirePermission(PERMISSIONS.activityDelete)
  @Post(':id/cancel')
  async cancel(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.activities.changeStatus(principal, id, 'CANCELLED') };
  }

  @RequirePermission(PERMISSIONS.activityDelete)
  @Delete(':id')
  async remove(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.activities.remove(principal, id) };
  }
}
