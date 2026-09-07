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
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentPrincipal, Public, RequirePermission } from '../auth/auth.decorators';
import { PERMISSIONS } from '../auth/auth.constants';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import {
  CreateExternalMappingDto,
  CreateIntegrationConnectionDto,
  CreateWebhookSubscriptionDto,
  InboundWebhookDto,
  IntegrationEventListQueryDto,
  RotateIntegrationSecretDto,
  UpdateIntegrationConnectionDto,
  UpdateWebhookSubscriptionDto,
} from './dto/integrations.dto';
import { IntegrationsService } from './integrations.service';

type RequestWithRawBody = Request & { rawBody?: Buffer };

@Controller('integrations')
export class IntegrationsController {
  constructor(@Inject(IntegrationsService) private readonly integrations: IntegrationsService) {}

  @RequirePermission(PERMISSIONS.integrationRead)
  @Get('connections')
  async connections(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return { data: await this.integrations.listConnections(principal) };
  }

  @RequirePermission(PERMISSIONS.integrationManage)
  @Post('connections')
  async createConnection(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: CreateIntegrationConnectionDto,
  ) {
    return { data: await this.integrations.createConnection(principal, dto) };
  }

  @RequirePermission(PERMISSIONS.integrationManage)
  @Patch('connections/:id')
  async updateConnection(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIntegrationConnectionDto,
  ) {
    return { data: await this.integrations.updateConnection(principal, id, dto) };
  }

  @RequirePermission(PERMISSIONS.integrationManage)
  @Post('connections/:id/rotate-secret')
  async rotateSecret(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RotateIntegrationSecretDto,
  ) {
    return { data: await this.integrations.rotateSecret(principal, id, dto) };
  }

  @Public()
  @HttpCode(202)
  @Post('webhooks/:connectionId')
  async inbound(
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @Body() dto: InboundWebhookDto,
    @Req() request: RequestWithRawBody,
    @Headers('x-unicrm-signature') signature?: string,
    @Headers('x-unicrm-timestamp') timestamp?: string,
    @Headers('x-unicrm-delivery') delivery?: string,
    @Headers('x-unicrm-event') event?: string,
  ) {
    const rawBody = request.rawBody ?? Buffer.from(JSON.stringify(request.body));
    return {
      data: await this.integrations.receiveInbound({
        connectionId,
        dto,
        rawBody,
        signature,
        timestamp,
        delivery,
        event,
        remoteAddress: request.ip ?? request.socket.remoteAddress ?? 'unknown',
      }),
    };
  }

  @RequirePermission(PERMISSIONS.integrationLogsRead)
  @Get('events')
  async events(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: IntegrationEventListQueryDto,
  ) {
    return { data: await this.integrations.listEvents(principal, query.status) };
  }

  @RequirePermission(PERMISSIONS.integrationRetry)
  @Post('events/:id/retry')
  async retryEvent(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.integrations.retryEvent(principal, id) };
  }

  @RequirePermission(PERMISSIONS.integrationRead)
  @Get('subscriptions')
  async subscriptions(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return { data: await this.integrations.listSubscriptions(principal) };
  }

  @RequirePermission(PERMISSIONS.webhookManage)
  @Post('subscriptions')
  async createSubscription(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: CreateWebhookSubscriptionDto,
  ) {
    return { data: await this.integrations.createSubscription(principal, dto) };
  }

  @RequirePermission(PERMISSIONS.webhookManage)
  @Patch('subscriptions/:id')
  async updateSubscription(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWebhookSubscriptionDto,
  ) {
    return { data: await this.integrations.updateSubscription(principal, id, dto) };
  }

  @RequirePermission(PERMISSIONS.integrationLogsRead)
  @Get('deliveries')
  async deliveries(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return { data: await this.integrations.listDeliveries(principal) };
  }

  @RequirePermission(PERMISSIONS.integrationRetry)
  @Post('deliveries/:id/retry')
  async retryDelivery(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.integrations.retryDelivery(principal, id) };
  }

  @RequirePermission(PERMISSIONS.integrationRead)
  @Get('mappings')
  async mappings(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return { data: await this.integrations.listMappings(principal) };
  }

  @RequirePermission(PERMISSIONS.integrationManage)
  @Post('mappings')
  async createMapping(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: CreateExternalMappingDto,
  ) {
    return { data: await this.integrations.createMapping(principal, dto) };
  }
}
