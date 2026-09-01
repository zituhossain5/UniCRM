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
import { CompaniesService } from './companies.service';
import { CompanyListQueryDto, CreateCompanyDto, UpdateCompanyDto } from './dto/companies.dto';

@Controller('companies')
export class CompaniesController {
  constructor(@Inject(CompaniesService) private readonly companies: CompaniesService) {}

  @RequirePermission(PERMISSIONS.companyRead)
  @Get()
  list(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Query() query: CompanyListQueryDto) {
    return this.companies.list(principal, query);
  }
  @RequirePermission(PERMISSIONS.companyCreate)
  @Post()
  async create(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: CreateCompanyDto,
  ) {
    return { data: await this.companies.create(principal, dto) };
  }
  @RequirePermission(PERMISSIONS.companyRead)
  @Get(':id')
  async get(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.companies.get(principal, id) };
  }
  @RequirePermission(PERMISSIONS.companyUpdate)
  @Patch(':id')
  async update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCompanyDto,
  ) {
    return { data: await this.companies.update(principal, id, dto) };
  }
  @RequirePermission(PERMISSIONS.companyDelete)
  @Delete(':id')
  async archive(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.companies.archive(principal, id) };
  }
}
