import { Controller, Get, Inject, Param, ParseUUIDPipe } from '@nestjs/common';
import { CurrentPrincipal, RequirePermission } from '../auth/auth.decorators';
import { PERMISSIONS } from '../auth/auth.constants';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import { PipelinesService } from './pipelines.service';
@Controller('pipelines')
export class PipelinesController {
  constructor(@Inject(PipelinesService) private readonly pipelines: PipelinesService) {}
  @RequirePermission(PERMISSIONS.pipelineRead)
  @Get()
  async list(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return { data: await this.pipelines.list(principal) };
  }
  @RequirePermission(PERMISSIONS.pipelineRead)
  @Get(':id/stages')
  async stages(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.pipelines.stages(principal, id) };
  }
}
