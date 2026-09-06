import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
  CreateSavedViewDto,
  SavedViewListQueryDto,
  UpdateSavedViewDto,
} from './dto/saved-views.dto';
import { SavedViewsService } from './saved-views.service';

@Controller('saved-views')
export class SavedViewsController {
  constructor(@Inject(SavedViewsService) private readonly views: SavedViewsService) {}
  @RequirePermission(PERMISSIONS.savedViewRead)
  @Get()
  async list(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: SavedViewListQueryDto,
  ) {
    return { data: await this.views.list(principal, query.entityType) };
  }
  @RequirePermission(PERMISSIONS.savedViewCreate)
  @Post()
  async create(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: CreateSavedViewDto,
  ) {
    return { data: await this.views.create(principal, dto) };
  }
  @RequirePermission(PERMISSIONS.savedViewUpdate)
  @Patch(':id')
  async update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSavedViewDto,
  ) {
    return { data: await this.views.update(principal, id, dto) };
  }
  @RequirePermission(PERMISSIONS.savedViewDelete)
  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.views.remove(principal, id);
  }
}
