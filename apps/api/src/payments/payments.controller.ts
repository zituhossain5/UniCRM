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
import { CreatePaymentDto, PaymentListQueryDto, UpdatePaymentDto } from './dto/payments.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(@Inject(PaymentsService) private readonly payments: PaymentsService) {}

  @RequirePermission(PERMISSIONS.paymentRead)
  @Get()
  list(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Query() query: PaymentListQueryDto) {
    return this.payments.list(principal, query);
  }

  @RequirePermission(PERMISSIONS.paymentRead)
  @Get('reference-data')
  async referenceData(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return { data: await this.payments.referenceData(principal) };
  }

  @RequirePermission(PERMISSIONS.paymentCreate)
  @Post()
  async create(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: CreatePaymentDto,
  ) {
    return { data: await this.payments.create(principal, dto) };
  }

  @RequirePermission(PERMISSIONS.paymentRead)
  @Get(':id')
  async get(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.payments.get(principal, id) };
  }

  @RequirePermission(PERMISSIONS.paymentUpdate)
  @Patch(':id')
  async update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePaymentDto,
  ) {
    return { data: await this.payments.update(principal, id, dto) };
  }

  @RequirePermission(PERMISSIONS.paymentDelete)
  @Delete(':id')
  async archive(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.payments.archive(principal, id) };
  }
}
