import { Module } from '@nestjs/common';
import { CustomFieldsModule } from '../custom-fields/custom-fields.module';
import { TagsModule } from '../tags/tags.module';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
@Module({
  imports: [CustomFieldsModule, TagsModule],
  controllers: [ContactsController],
  providers: [ContactsService],
})
export class ContactsModule {}
