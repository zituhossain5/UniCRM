import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentPrincipal, Public, RequirePermission } from '../auth/auth.decorators';
import { PERMISSIONS } from '../auth/auth.constants';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import {
  CreateWebToLeadIntegrationDto,
  UpdateWebToLeadIntegrationDto,
  WebToLeadPayloadDto,
} from './dto/web-to-lead.dto';
import { WebToLeadService } from './web-to-lead.service';

type RequestWithRawBody = Request & { rawBody?: Buffer };

@Controller()
export class WebToLeadController {
  constructor(@Inject(WebToLeadService) private readonly webToLead: WebToLeadService) {}

  @RequirePermission(PERMISSIONS.integrationRead)
  @Get('integrations/web-to-lead')
  async list(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return { data: await this.webToLead.list(principal) };
  }

  @RequirePermission(PERMISSIONS.integrationRead)
  @Get('integrations/web-to-lead/references')
  async references(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return { data: await this.webToLead.references(principal) };
  }

  @RequirePermission(PERMISSIONS.integrationRead)
  @Get('integrations/web-to-lead/:id')
  async get(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.webToLead.get(principal, id) };
  }

  @RequirePermission(PERMISSIONS.integrationManage)
  @Post('integrations/web-to-lead')
  async create(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: CreateWebToLeadIntegrationDto,
  ) {
    return { data: await this.webToLead.create(principal, dto) };
  }

  @RequirePermission(PERMISSIONS.integrationManage)
  @Patch('integrations/web-to-lead/:id')
  async update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWebToLeadIntegrationDto,
  ) {
    return { data: await this.webToLead.update(principal, id, dto) };
  }

  @RequirePermission(PERMISSIONS.integrationManage)
  @Post('integrations/web-to-lead/:id/rotate-secret')
  async rotateSecret(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.webToLead.rotateSecret(principal, id) };
  }

  @RequirePermission(PERMISSIONS.integrationLogsRead)
  @Get('integrations/web-to-lead/:id/logs')
  async logs(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.webToLead.logs(principal, id) };
  }

  @RequirePermission(PERMISSIONS.integrationManage)
  @Post('integrations/web-to-lead/:id/test')
  async test(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: WebToLeadPayloadDto,
  ) {
    return { data: await this.webToLead.test(principal, id, dto) };
  }

  @Public()
  @HttpCode(202)
  @Post('inbound/web-to-lead/:integrationId')
  async receive(
    @Param('integrationId', ParseUUIDPipe) integrationId: string,
    @Body() dto: WebToLeadPayloadDto,
    @Req() request: RequestWithRawBody,
    @Headers('x-unicrm-timestamp') timestamp?: string,
    @Headers('x-unicrm-signature') signature?: string,
    @Headers('x-unicrm-idempotency-key') idempotencyKey?: string,
  ) {
    const result = await this.webToLead.receive({
      integrationId,
      payload: dto,
      rawBody: request.rawBody ?? Buffer.from(JSON.stringify(request.body)),
      signature,
      timestamp,
      idempotencyKey,
      remoteAddress: request.ip ?? request.socket.remoteAddress ?? 'unknown',
      secure: request.secure || request.protocol === 'https',
    });
    return { data: { accepted: true, submissionId: result.submissionId } };
  }
}
