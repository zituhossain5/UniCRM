import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentPrincipal, RequirePermission } from '../auth/auth.decorators';
import { PERMISSIONS } from '../auth/auth.constants';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import { DuplicateEntityType } from '../generated/prisma/enums';
import { DataManagementService } from './data-management.service';
import {
  BulkUpdateDto,
  CommitImportDto,
  CreateExportDto,
  ImportPreviewDto,
  MergeRecordsDto,
} from './dto/data-management.dto';

@Controller('data-management')
export class DataManagementController {
  constructor(@Inject(DataManagementService) private readonly data: DataManagementService) {}

  @RequirePermission(PERMISSIONS.settingsRead)
  @Get('jobs')
  async jobs(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return { data: await this.data.listJobs(principal) };
  }

  @RequirePermission(PERMISSIONS.dataImport)
  @Post('imports/preview')
  previewImport(@Body() dto: ImportPreviewDto) {
    return { data: this.data.previewImport(dto) };
  }

  @RequirePermission(PERMISSIONS.dataImport)
  @Post('imports')
  async importData(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: CommitImportDto,
  ) {
    return { data: await this.data.commitImport(principal, dto) };
  }

  @RequirePermission(PERMISSIONS.dataExport)
  @Post('exports')
  async exportData(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: CreateExportDto,
  ) {
    return { data: await this.data.exportData(principal, dto) };
  }

  @RequirePermission(PERMISSIONS.dataExport)
  @Header('content-type', 'text/csv; charset=utf-8')
  @Get('exports/:id/download')
  async downloadExport(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() response: Response,
  ) {
    const result = await this.data.downloadExport(principal, id);
    response.setHeader('content-disposition', `attachment; filename="${result.fileName}"`);
    response.send(result.csv);
  }

  @RequirePermission(PERMISSIONS.dataDuplicatesRead)
  @Get('duplicates')
  async duplicates(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query('entityType', new ParseEnumPipe(DuplicateEntityType)) entityType: DuplicateEntityType,
  ) {
    return { data: await this.data.duplicates(principal, entityType) };
  }

  @RequirePermission(PERMISSIONS.dataMerge)
  @Post('merges')
  async merge(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Body() dto: MergeRecordsDto) {
    return { data: await this.data.merge(principal, dto.entityType, dto.sourceId, dto.targetId) };
  }

  @RequirePermission(PERMISSIONS.companyBulkUpdate)
  @Post('bulk-update/companies')
  async bulkUpdateCompanies(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: BulkUpdateDto,
  ) {
    return { data: await this.data.bulkUpdate(principal, 'companies', dto) };
  }

  @RequirePermission(PERMISSIONS.contactBulkUpdate)
  @Post('bulk-update/contacts')
  async bulkUpdateContacts(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: BulkUpdateDto,
  ) {
    return { data: await this.data.bulkUpdate(principal, 'contacts', dto) };
  }

  @RequirePermission(PERMISSIONS.leadBulkUpdate)
  @Post('bulk-update/leads')
  async bulkUpdateLeads(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: BulkUpdateDto,
  ) {
    return { data: await this.data.bulkUpdate(principal, 'leads', dto) };
  }

  @RequirePermission(PERMISSIONS.projectBulkUpdate)
  @Post('bulk-update/projects')
  async bulkUpdateProjects(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: BulkUpdateDto,
  ) {
    return { data: await this.data.bulkUpdate(principal, 'projects', dto) };
  }

  @RequirePermission(PERMISSIONS.taskBulkUpdate)
  @Post('bulk-update/tasks')
  async bulkUpdateTasks(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: BulkUpdateDto,
  ) {
    return { data: await this.data.bulkUpdate(principal, 'tasks', dto) };
  }
}
