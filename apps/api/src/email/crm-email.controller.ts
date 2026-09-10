import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentPrincipal, RequirePermission } from '../auth/auth.decorators';
import { PERMISSIONS } from '../auth/auth.constants';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import { CrmEmailService } from './crm-email.service';
import {
  ComposeContextQueryDto,
  CreateEmailTemplateDto,
  EmailHistoryQueryDto,
  PreviewEmailTemplateDto,
  SendCrmEmailDto,
  TestEmailTemplateDto,
  UpdateEmailSettingsDto,
  UpdateEmailTemplateDto,
} from './dto/crm-email.dto';

@Controller('email-templates')
export class EmailTemplatesController {
  constructor(@Inject(CrmEmailService) private readonly crmEmail: CrmEmailService) {}

  @RequirePermission(PERMISSIONS.emailTemplateRead)
  @Get()
  async list(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query('active', new ParseBoolPipe({ optional: true })) active?: boolean,
  ) {
    return { data: await this.crmEmail.listTemplates(principal, active) };
  }

  @RequirePermission(PERMISSIONS.emailTemplateManage)
  @Post()
  async create(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: CreateEmailTemplateDto,
  ) {
    return { data: await this.crmEmail.createTemplate(principal, dto) };
  }

  @RequirePermission(PERMISSIONS.emailTemplateManage)
  @Patch(':id')
  async update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmailTemplateDto,
  ) {
    return { data: await this.crmEmail.updateTemplate(principal, id, dto) };
  }

  @RequirePermission(PERMISSIONS.emailTemplateManage)
  @Post(':id/duplicate')
  async duplicate(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.crmEmail.duplicateTemplate(principal, id) };
  }

  @RequirePermission(PERMISSIONS.emailTemplateRead)
  @Post(':id/preview')
  async preview(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PreviewEmailTemplateDto,
  ) {
    return {
      data: await this.crmEmail.preview(principal, id, dto.relatedEntityType, dto.relatedEntityId),
    };
  }

  @RequirePermission(PERMISSIONS.emailTemplateManage)
  @Post(':id/test')
  async test(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TestEmailTemplateDto,
  ) {
    return { data: await this.crmEmail.sendTest(principal, id, dto.to) };
  }
}

@Controller('email-settings')
export class EmailSettingsController {
  constructor(@Inject(CrmEmailService) private readonly crmEmail: CrmEmailService) {}
  @RequirePermission(PERMISSIONS.emailTemplateRead)
  @Get()
  async get(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return { data: await this.crmEmail.getSettings(principal) };
  }
  @RequirePermission(PERMISSIONS.emailTemplateManage)
  @Patch()
  async update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: UpdateEmailSettingsDto,
  ) {
    return { data: await this.crmEmail.updateSettings(principal, dto) };
  }
}

@Controller('emails')
export class CrmEmailsController {
  constructor(@Inject(CrmEmailService) private readonly crmEmail: CrmEmailService) {}
  @RequirePermission(PERMISSIONS.emailRead)
  @Get()
  history(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: EmailHistoryQueryDto,
  ) {
    return this.crmEmail.history(principal, query);
  }
  @RequirePermission(PERMISSIONS.emailRead)
  @Get('compose-context')
  async context(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: ComposeContextQueryDto,
  ) {
    return {
      data: await this.crmEmail.composeContext(
        principal,
        query.relatedEntityType,
        query.relatedEntityId,
      ),
    };
  }
  @RequirePermission(PERMISSIONS.emailRead)
  @Get(':id')
  async detail(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.crmEmail.detail(principal, id) };
  }
  @RequirePermission(PERMISSIONS.emailSend)
  @Post()
  async send(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Body() dto: SendCrmEmailDto) {
    return { data: await this.crmEmail.send(principal, dto) };
  }
}
