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
} from '@nestjs/common';
import { CurrentPrincipal, RequirePermission } from '../auth/auth.decorators';
import { PERMISSIONS } from '../auth/auth.constants';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import { CreateTagDto, TagAssignmentDto, UpdateTagDto } from './dto/tags.dto';
import { TagsService } from './tags.service';

@Controller('tags')
export class TagsController {
  constructor(@Inject(TagsService) private readonly tags: TagsService) {}
  @RequirePermission(PERMISSIONS.tagRead)
  @Get()
  async list(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return { data: await this.tags.list(principal) };
  }
  @RequirePermission(PERMISSIONS.tagManage)
  @Post()
  async create(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Body() dto: CreateTagDto) {
    return { data: await this.tags.create(principal, dto.name) };
  }
  @RequirePermission(PERMISSIONS.tagManage)
  @Patch(':id')
  async update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTagDto,
  ) {
    return { data: await this.tags.update(principal, id, dto.name) };
  }
  @RequirePermission(PERMISSIONS.tagManage)
  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.tags.remove(principal, id);
  }
  @RequirePermission(PERMISSIONS.tagRead)
  @Post(':id/records')
  async attach(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TagAssignmentDto,
  ) {
    return { data: await this.tags.attach(principal, id, dto.entityType, dto.entityId) };
  }
  @RequirePermission(PERMISSIONS.tagRead)
  @Delete(':id/records')
  @HttpCode(204)
  async detach(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TagAssignmentDto,
  ) {
    await this.tags.detach(principal, id, dto.entityType, dto.entityId);
  }
}
