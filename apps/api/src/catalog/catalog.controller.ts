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
import { CatalogService } from './catalog.service';
import {
  CatalogListQueryDto,
  CreateCatalogCategoryDto,
  CreateCatalogItemDto,
  UpdateCatalogCategoryDto,
  UpdateCatalogItemDto,
} from './dto/catalog.dto';

@Controller('catalog')
export class CatalogController {
  constructor(@Inject(CatalogService) private readonly catalog: CatalogService) {}

  @RequirePermission(PERMISSIONS.catalogRead)
  @Get()
  list(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Query() query: CatalogListQueryDto) {
    return this.catalog.list(principal, query);
  }

  @RequirePermission(PERMISSIONS.catalogRead)
  @Get('reference-data')
  async referenceData(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return { data: await this.catalog.referenceData(principal) };
  }

  @RequirePermission(PERMISSIONS.catalogRead)
  @Get('categories')
  async categories(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return { data: await this.catalog.listCategories(principal) };
  }

  @RequirePermission(PERMISSIONS.catalogCreate)
  @Post('categories')
  async createCategory(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: CreateCatalogCategoryDto,
  ) {
    return { data: await this.catalog.createCategory(principal, dto) };
  }

  @RequirePermission(PERMISSIONS.catalogUpdate)
  @Patch('categories/:id')
  async updateCategory(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCatalogCategoryDto,
  ) {
    return { data: await this.catalog.updateCategory(principal, id, dto) };
  }

  @RequirePermission(PERMISSIONS.catalogCreate)
  @Post()
  async create(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: CreateCatalogItemDto,
  ) {
    return { data: await this.catalog.create(principal, dto) };
  }

  @RequirePermission(PERMISSIONS.catalogRead)
  @Get(':id')
  async get(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.catalog.get(principal, id) };
  }

  @RequirePermission(PERMISSIONS.catalogUpdate)
  @Patch(':id')
  async update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCatalogItemDto,
  ) {
    return { data: await this.catalog.update(principal, id, dto) };
  }

  @RequirePermission(PERMISSIONS.catalogDelete)
  @Delete(':id')
  async archive(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.catalog.archive(principal, id) };
  }
}
