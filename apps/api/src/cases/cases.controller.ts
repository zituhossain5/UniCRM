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
import { CasesService } from './cases.service';
import {
  CaseListQueryDto,
  CaseReportQueryDto,
  CreateCaseCommentDto,
  CreateCaseDto,
  CreateCaseTaskDto,
  UpdateCaseDto,
} from './dto/cases.dto';

@Controller('cases')
export class CasesController {
  constructor(@Inject(CasesService) private readonly cases: CasesService) {}

  @RequirePermission(PERMISSIONS.caseRead)
  @Get()
  list(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Query() query: CaseListQueryDto) {
    return this.cases.list(principal, query);
  }

  @RequirePermission(PERMISSIONS.caseRead)
  @Get('metrics')
  metrics(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.cases.metrics(principal);
  }

  @RequirePermission(PERMISSIONS.caseRead)
  @Get('reports')
  reports(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: CaseReportQueryDto,
  ) {
    return this.cases.reports(principal, query);
  }

  @RequirePermission(PERMISSIONS.caseCreate)
  @Post()
  async create(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Body() dto: CreateCaseDto) {
    return { data: await this.cases.create(principal, dto) };
  }

  @RequirePermission(PERMISSIONS.caseRead)
  @Get(':id')
  async get(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.cases.get(principal, id) };
  }

  @RequirePermission(PERMISSIONS.caseUpdate)
  @Patch(':id')
  async update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCaseDto,
  ) {
    return { data: await this.cases.update(principal, id, dto) };
  }

  @RequirePermission(PERMISSIONS.caseDelete)
  @Delete(':id')
  async archive(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.cases.archive(principal, id) };
  }

  @RequirePermission(PERMISSIONS.caseComment)
  @Post(':id/comments')
  async comment(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCaseCommentDto,
  ) {
    return { data: await this.cases.comment(principal, id, dto) };
  }

  @RequirePermission(PERMISSIONS.caseUpdate, PERMISSIONS.taskCreate)
  @Post(':id/tasks')
  async task(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCaseTaskDto,
  ) {
    return { data: await this.cases.createTask(principal, id, dto) };
  }
}
