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
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentPrincipal, RequirePermission } from '../auth/auth.decorators';
import { PERMISSIONS } from '../auth/auth.constants';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import {
  CreateQuotationDto,
  QuotationListQueryDto,
  UpdateQuotationDto,
} from './dto/quotations.dto';
import { QuotationsService } from './quotations.service';

@Controller('quotations')
export class QuotationsController {
  constructor(@Inject(QuotationsService) private readonly quotations: QuotationsService) {}

  @RequirePermission(PERMISSIONS.quotationRead)
  @Get()
  list(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: QuotationListQueryDto,
  ) {
    return this.quotations.list(principal, query);
  }

  @RequirePermission(PERMISSIONS.quotationRead)
  @Get('reference-data')
  async referenceData(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return { data: await this.quotations.referenceData(principal) };
  }

  @RequirePermission(PERMISSIONS.quotationCreate)
  @Post()
  async create(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: CreateQuotationDto,
  ) {
    return { data: await this.quotations.create(principal, dto) };
  }

  @RequirePermission(PERMISSIONS.quotationRead)
  @Get(':id')
  async get(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.quotations.get(principal, id) };
  }

  @RequirePermission(PERMISSIONS.quotationUpdate)
  @Patch(':id')
  async update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQuotationDto,
  ) {
    return { data: await this.quotations.update(principal, id, dto) };
  }

  @RequirePermission(PERMISSIONS.quotationDelete)
  @Delete(':id')
  async archive(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.quotations.archive(principal, id) };
  }

  @RequirePermission(PERMISSIONS.quotationSend)
  @Post(':id/send')
  async send(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.quotations.transition(principal, id, 'send') };
  }

  @RequirePermission(PERMISSIONS.quotationAccept)
  @Post(':id/accept')
  async accept(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.quotations.transition(principal, id, 'accept') };
  }

  @RequirePermission(PERMISSIONS.quotationReject)
  @Post(':id/reject')
  async reject(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.quotations.transition(principal, id, 'reject') };
  }

  @RequirePermission(PERMISSIONS.quotationRead)
  @Get(':id/pdf')
  async pdf(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() response: Response,
  ) {
    const pdf = await this.quotations.pdfContent(principal, id);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename="${pdf.fileName}"`);
    response.send(pdf.content);
  }
}
