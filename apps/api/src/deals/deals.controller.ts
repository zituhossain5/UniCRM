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
import { DealsService } from './deals.service';
import {
  CreateDealDto,
  CreateDealProjectDto,
  DealListQueryDto,
  UpdateDealDto,
  UpdateDealOwnerDto,
  UpdateDealItemsDto,
  UpdateDealStageDto,
} from './dto/deals.dto';

@Controller('deals')
export class DealsController {
  constructor(@Inject(DealsService) private readonly deals: DealsService) {}

  @RequirePermission(PERMISSIONS.dealRead)
  @Get()
  list(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Query() query: DealListQueryDto) {
    return this.deals.list(principal, query);
  }

  @RequirePermission(PERMISSIONS.dealCreate)
  @Post()
  async create(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Body() dto: CreateDealDto) {
    return { data: await this.deals.create(principal, dto) };
  }

  @RequirePermission(PERMISSIONS.dealRead)
  @Get(':id')
  async get(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.deals.get(principal, id) };
  }

  @RequirePermission(PERMISSIONS.dealUpdate)
  @Patch(':id')
  async update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDealDto,
  ) {
    return { data: await this.deals.update(principal, id, dto) };
  }

  @RequirePermission(PERMISSIONS.dealDelete)
  @Delete(':id')
  async archive(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.deals.archive(principal, id) };
  }

  @RequirePermission(PERMISSIONS.dealStageUpdate)
  @Patch(':id/stage')
  async stage(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDealStageDto,
  ) {
    return { data: await this.deals.changeStage(principal, id, dto) };
  }

  @RequirePermission(PERMISSIONS.dealAssign)
  @Patch(':id/owner')
  async owner(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDealOwnerDto,
  ) {
    return { data: await this.deals.changeOwner(principal, id, dto) };
  }

  @RequirePermission(PERMISSIONS.projectCreate)
  @Post(':id/project')
  async createProject(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateDealProjectDto,
  ) {
    return { data: await this.deals.createProject(principal, id, dto) };
  }

  @RequirePermission(PERMISSIONS.dealUpdate)
  @Patch(':id/items')
  async items(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDealItemsDto,
  ) {
    return { data: await this.deals.updateItems(principal, id, dto) };
  }
}
