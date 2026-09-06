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
import { CustomFieldsService } from './custom-fields.service';
import {
  CreateCustomFieldDefinitionDto,
  CustomFieldListQueryDto,
  ReorderCustomFieldsDto,
  UpdateCustomFieldDefinitionDto,
} from './dto/custom-fields.dto';
import { ConfigurableEntityType } from '../generated/prisma/enums';

@Controller('custom-fields')
export class CustomFieldsController {
  constructor(@Inject(CustomFieldsService) private readonly fields: CustomFieldsService) {}
  @RequirePermission(PERMISSIONS.customFieldRead)
  @Get()
  async list(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: CustomFieldListQueryDto,
  ) {
    return { data: await this.fields.list(principal, query.entityType, query.active) };
  }
  @RequirePermission(PERMISSIONS.customFieldManage)
  @Post()
  async create(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: CreateCustomFieldDefinitionDto,
  ) {
    return { data: await this.fields.create(principal, dto) };
  }
  @RequirePermission(PERMISSIONS.customFieldManage)
  @Patch(':id')
  async update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomFieldDefinitionDto,
  ) {
    return { data: await this.fields.update(principal, id, dto) };
  }
  @RequirePermission(PERMISSIONS.customFieldManage)
  @Post('reorder/:entityType')
  async reorder(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('entityType', new ParseEnumPipe(ConfigurableEntityType))
    entityType: ConfigurableEntityType,
    @Body() dto: ReorderCustomFieldsDto,
  ) {
    return { data: await this.fields.reorder(principal, entityType, dto) };
  }
}
