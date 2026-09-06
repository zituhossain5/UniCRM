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
  Put,
} from '@nestjs/common';
import { CurrentPrincipal, RequirePermission } from '../auth/auth.decorators';
import { PERMISSIONS } from '../auth/auth.constants';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import {
  CreatePipelineDto,
  ReplacePipelineStagesDto,
  UpdatePipelineDto,
} from './dto/pipelines.dto';
import { PipelinesService } from './pipelines.service';

@Controller('pipelines')
export class PipelinesController {
  constructor(@Inject(PipelinesService) private readonly pipelines: PipelinesService) {}
  @RequirePermission(PERMISSIONS.pipelineRead)
  @Get()
  async list(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return { data: await this.pipelines.list(principal) };
  }
  @RequirePermission(PERMISSIONS.pipelineManage)
  @Post()
  async create(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: CreatePipelineDto,
  ) {
    return { data: await this.pipelines.create(principal, dto) };
  }
  @RequirePermission(PERMISSIONS.pipelineRead)
  @Get(':id/stages')
  async stages(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.pipelines.stages(principal, id) };
  }
  @RequirePermission(PERMISSIONS.pipelineManage)
  @Patch(':id')
  async update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePipelineDto,
  ) {
    return { data: await this.pipelines.update(principal, id, dto) };
  }
  @RequirePermission(PERMISSIONS.pipelineManage)
  @Put(':id/stages')
  async replaceStages(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplacePipelineStagesDto,
  ) {
    return { data: await this.pipelines.replaceStages(principal, id, dto) };
  }
  @RequirePermission(PERMISSIONS.pipelineManage)
  @Delete(':id')
  async archive(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.pipelines.archive(principal, id) };
  }
}
