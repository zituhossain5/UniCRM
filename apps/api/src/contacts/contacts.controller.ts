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
import { ContactsService } from './contacts.service';
import { ContactListQueryDto, CreateContactDto, UpdateContactDto } from './dto/contacts.dto';

@Controller('contacts')
export class ContactsController {
  constructor(@Inject(ContactsService) private readonly contacts: ContactsService) {}
  @RequirePermission(PERMISSIONS.contactRead)
  @Get()
  list(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Query() query: ContactListQueryDto) {
    return this.contacts.list(principal, query);
  }
  @RequirePermission(PERMISSIONS.contactCreate)
  @Post()
  async create(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: CreateContactDto,
  ) {
    return { data: await this.contacts.create(principal, dto) };
  }
  @RequirePermission(PERMISSIONS.contactRead)
  @Get(':id')
  async get(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.contacts.get(principal, id) };
  }
  @RequirePermission(PERMISSIONS.contactUpdate)
  @Patch(':id')
  async update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContactDto,
  ) {
    return { data: await this.contacts.update(principal, id, dto) };
  }
  @RequirePermission(PERMISSIONS.contactDelete)
  @Delete(':id')
  async archive(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.contacts.archive(principal, id) };
  }
}
