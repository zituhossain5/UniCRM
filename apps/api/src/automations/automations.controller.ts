import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentPrincipal, RequirePermission } from '../auth/auth.decorators';
import { PERMISSIONS } from '../auth/auth.constants';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import { AutomationsService } from './automations.service';
import { CreateAutomationRuleDto, UpdateAutomationRuleDto } from './dto/automations.dto';
import { AutomationEntityType } from '../generated/prisma/enums';

@Controller('automations')
export class AutomationsController {
  constructor(@Inject(AutomationsService) private readonly automations: AutomationsService) {}

  @RequirePermission(PERMISSIONS.automationRead)
  @Get()
  async list(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return { data: await this.automations.listRules(principal) };
  }

  @RequirePermission(PERMISSIONS.automationRead)
  @Get('reference-data')
  async referenceData(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query('entityType', new ParseEnumPipe(AutomationEntityType)) entityType: AutomationEntityType,
  ) {
    return { data: await this.automations.referenceData(principal, entityType) };
  }

  @RequirePermission(PERMISSIONS.automationRead)
  @Get(':id')
  async get(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.automations.getRule(principal, id) };
  }

  @RequirePermission(PERMISSIONS.automationManage)
  @Post()
  async create(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: CreateAutomationRuleDto,
  ) {
    return { data: await this.automations.createRule(principal, dto) };
  }

  @RequirePermission(PERMISSIONS.automationManage)
  @Patch(':id')
  async update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAutomationRuleDto,
  ) {
    return { data: await this.automations.updateRule(principal, id, dto) };
  }

  @RequirePermission(PERMISSIONS.automationRunsRead)
  @Get(':id/runs')
  async runs(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.automations.listRuns(principal, id) };
  }

  @RequirePermission(PERMISSIONS.automationRetry)
  @Post('runs/:runId/retry')
  async retry(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('runId', ParseUUIDPipe) runId: string,
  ) {
    return { data: await this.automations.retryRun(principal, runId) };
  }
}
