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
import {
  ActivityListQueryDto,
  CreateActivityDto,
  CreateFollowUpDto,
  CreateLeadDto,
  LeadListQueryDto,
  RescheduleFollowUpDto,
  UpdateLeadDto,
  UpdateLeadOwnerDto,
  UpdateLeadStageDto,
} from './dto/leads.dto';
import { LeadsService } from './leads.service';

@Controller('leads')
export class LeadsController {
  constructor(@Inject(LeadsService) private readonly leads: LeadsService) {}
  @RequirePermission(PERMISSIONS.leadRead)
  @Get()
  list(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Query() query: LeadListQueryDto) {
    return this.leads.list(principal, query);
  }
  @RequirePermission(PERMISSIONS.leadCreate)
  @Post()
  async create(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Body() dto: CreateLeadDto) {
    return { data: await this.leads.create(principal, dto) };
  }
  @RequirePermission(PERMISSIONS.leadRead)
  @Get(':id')
  async get(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.leads.get(principal, id) };
  }
  @RequirePermission(PERMISSIONS.leadUpdate)
  @Patch(':id')
  async update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeadDto,
  ) {
    return { data: await this.leads.update(principal, id, dto) };
  }
  @RequirePermission(PERMISSIONS.leadDelete)
  @Delete(':id')
  async archive(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.leads.archive(principal, id) };
  }
  @RequirePermission(PERMISSIONS.leadStageUpdate)
  @Patch(':id/stage')
  async stage(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeadStageDto,
  ) {
    return { data: await this.leads.changeStage(principal, id, dto) };
  }
  @RequirePermission(PERMISSIONS.leadAssign)
  @Patch(':id/owner')
  async owner(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeadOwnerDto,
  ) {
    return { data: await this.leads.changeOwner(principal, id, dto) };
  }
  @RequirePermission(PERMISSIONS.activityRead)
  @Get(':id/activities')
  activities(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ActivityListQueryDto,
  ) {
    return this.leads.activities(principal, id, query);
  }
  @RequirePermission(PERMISSIONS.activityCreate)
  @Post(':id/activities')
  async addActivity(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateActivityDto,
  ) {
    return { data: await this.leads.addActivity(principal, id, dto) };
  }
  @RequirePermission(PERMISSIONS.activityCreate)
  @Post(':id/follow-ups')
  async createFollowUp(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateFollowUpDto,
  ) {
    return { data: await this.leads.createFollowUp(principal, id, dto) };
  }
  @RequirePermission(PERMISSIONS.activityCreate)
  @Patch(':leadId/follow-ups/:id')
  async reschedule(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RescheduleFollowUpDto,
  ) {
    return { data: await this.leads.rescheduleFollowUp(principal, leadId, id, dto) };
  }
  @RequirePermission(PERMISSIONS.activityCreate)
  @Post(':leadId/follow-ups/:id/complete')
  async complete(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.leads.completeFollowUp(principal, leadId, id) };
  }
  @RequirePermission(PERMISSIONS.activityCreate)
  @Post(':leadId/follow-ups/:id/cancel')
  async cancel(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.leads.cancelFollowUp(principal, leadId, id) };
  }
}
