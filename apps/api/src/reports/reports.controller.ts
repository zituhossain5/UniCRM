import { Controller, Get, Inject, Query } from '@nestjs/common';
import { CurrentPrincipal, RequirePermission } from '../auth/auth.decorators';
import { PERMISSIONS } from '../auth/auth.constants';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import { ReportFilterDto } from './dto/reports.dto';
import { ReportsService } from './reports.service';

@Controller('reports')
@RequirePermission(PERMISSIONS.reportsRead)
export class ReportsController {
  constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}

  @RequirePermission(PERMISSIONS.leadRead)
  @Get('lead-pipeline')
  pipeline(@CurrentPrincipal() p: AuthenticatedPrincipal, @Query() q: ReportFilterDto) {
    return this.reports.leadPipeline(p, q);
  }
  @RequirePermission(PERMISSIONS.leadRead)
  @Get('lead-conversion')
  conversion(@CurrentPrincipal() p: AuthenticatedPrincipal, @Query() q: ReportFilterDto) {
    return this.reports.leadConversion(p, q);
  }
  @RequirePermission(PERMISSIONS.dealRead)
  @Get('deal-pipeline')
  dealPipeline(@CurrentPrincipal() p: AuthenticatedPrincipal, @Query() q: ReportFilterDto) {
    return this.reports.dealPipeline(p, q);
  }
  @RequirePermission(PERMISSIONS.dealRead)
  @Get('deal-conversion')
  dealConversion(@CurrentPrincipal() p: AuthenticatedPrincipal, @Query() q: ReportFilterDto) {
    return this.reports.dealConversion(p, q);
  }
  @RequirePermission(PERMISSIONS.forecastRead)
  @Get('forecast-by-owner')
  forecastByOwner(@CurrentPrincipal() p: AuthenticatedPrincipal, @Query() q: ReportFilterDto) {
    return this.reports.forecastByOwner(p, q);
  }
  @RequirePermission(PERMISSIONS.forecastRead)
  @Get('forecast-by-stage')
  forecastByStage(@CurrentPrincipal() p: AuthenticatedPrincipal, @Query() q: ReportFilterDto) {
    return this.reports.forecastByStage(p, q);
  }
  @RequirePermission(PERMISSIONS.dealRead)
  @Get('lead-to-deal')
  leadToDeal(@CurrentPrincipal() p: AuthenticatedPrincipal, @Query() q: ReportFilterDto) {
    return this.reports.leadToDeal(p, q);
  }
  @RequirePermission(PERMISSIONS.leadRead)
  @Get('leads-by-source')
  sources(@CurrentPrincipal() p: AuthenticatedPrincipal, @Query() q: ReportFilterDto) {
    return this.reports.leadsBySource(p, q);
  }
  @RequirePermission(PERMISSIONS.projectRead)
  @Get('projects-by-status')
  projects(@CurrentPrincipal() p: AuthenticatedPrincipal, @Query() q: ReportFilterDto) {
    return this.reports.projectsByStatus(p, q);
  }
  @RequirePermission(PERMISSIONS.taskRead)
  @Get('tasks-by-status')
  tasks(@CurrentPrincipal() p: AuthenticatedPrincipal, @Query() q: ReportFilterDto) {
    return this.reports.tasksByStatus(p, q);
  }
  @RequirePermission(PERMISSIONS.taskRead)
  @Get('overdue-tasks')
  overdue(@CurrentPrincipal() p: AuthenticatedPrincipal, @Query() q: ReportFilterDto) {
    return this.reports.overdueTasks(p, q);
  }
  @RequirePermission(PERMISSIONS.paymentRead)
  @Get('payments')
  payments(@CurrentPrincipal() p: AuthenticatedPrincipal, @Query() q: ReportFilterDto) {
    return this.reports.payments(p, q);
  }
  @RequirePermission(PERMISSIONS.paymentRead)
  @Get('outstanding-balances')
  outstanding(@CurrentPrincipal() p: AuthenticatedPrincipal, @Query() q: ReportFilterDto) {
    return this.reports.outstandingBalances(p, q);
  }
}
