import { Module } from '@nestjs/common';
import { PipelinesModule } from '../pipelines/pipelines.module';
import { CustomFieldsModule } from '../custom-fields/custom-fields.module';
import { TagsModule } from '../tags/tags.module';
import { FollowUpsController } from './follow-ups.controller';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
@Module({
  imports: [PipelinesModule, CustomFieldsModule, TagsModule],
  controllers: [LeadsController, FollowUpsController],
  providers: [LeadsService],
  exports: [LeadsService],
})
export class LeadsModule {}
