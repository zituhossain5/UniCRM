import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentPrincipal, RequirePermission } from '../auth/auth.decorators';
import { PERMISSIONS } from '../auth/auth.constants';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import {
  CreateMailboxDto,
  LinkThreadDto,
  MailListQueryDto,
  ReplyThreadDto,
  UpdateMailboxDto,
} from './dto/mailboxes.dto';
import { MailboxesService } from './mailboxes.service';

@Controller('mailboxes')
export class MailboxesController {
  constructor(@Inject(MailboxesService) private readonly mailboxes: MailboxesService) {}

  @RequirePermission(PERMISSIONS.mailboxRead)
  @Get()
  async list(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return { data: await this.mailboxes.listMailboxes(principal) };
  }

  @RequirePermission(PERMISSIONS.mailboxManage)
  @Post()
  async create(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: CreateMailboxDto,
  ) {
    return { data: await this.mailboxes.createMailbox(principal, dto) };
  }

  @RequirePermission(PERMISSIONS.mailboxManage)
  @Patch(':id')
  async update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMailboxDto,
  ) {
    return { data: await this.mailboxes.updateMailbox(principal, id, dto) };
  }

  @RequirePermission(PERMISSIONS.mailboxManage)
  @Post(':id/test-imap')
  async testImap(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.mailboxes.testImap(principal, id) };
  }

  @RequirePermission(PERMISSIONS.mailboxManage)
  @Post(':id/test-smtp')
  async testSmtp(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.mailboxes.testSmtp(principal, id) };
  }

  @RequirePermission(PERMISSIONS.mailboxManage)
  @Post(':id/sync')
  async sync(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.mailboxes.requestSync(principal, id) };
  }
}

@Controller('mail')
export class MailController {
  constructor(@Inject(MailboxesService) private readonly mailboxes: MailboxesService) {}

  @RequirePermission(PERMISSIONS.mailRead)
  @Get('mailboxes')
  async availableMailboxes(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return { data: await this.mailboxes.listAvailableMailboxes(principal) };
  }

  @RequirePermission(PERMISSIONS.mailRead)
  @Get()
  list(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Query() query: MailListQueryDto) {
    return this.mailboxes.listMessages(principal, query);
  }

  @RequirePermission(PERMISSIONS.mailRead)
  @Get('threads/:id')
  async thread(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.mailboxes.thread(principal, id) };
  }

  @RequirePermission(PERMISSIONS.mailLink)
  @Post('threads/:id/link')
  async link(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkThreadDto,
  ) {
    return { data: await this.mailboxes.linkThread(principal, id, dto) };
  }

  @RequirePermission(PERMISSIONS.mailSend)
  @Post('threads/:id/reply')
  async reply(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplyThreadDto,
  ) {
    return { data: await this.mailboxes.reply(principal, id, dto) };
  }

  @RequirePermission(PERMISSIONS.mailRead)
  @Get('attachments/:id/download')
  async download(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { attachment, content } = await this.mailboxes.downloadAttachment(principal, id);
    response.setHeader('Content-Type', attachment.mimeType);
    response.setHeader('Content-Length', attachment.size.toString());
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${attachment.fileName.replace(/["\\]/g, '_')}"`,
    );
    return new StreamableFile(content);
  }
}
