import { Module } from '@nestjs/common';
import { PipelinesModule } from '../pipelines/pipelines.module';
import { FollowUpsController } from './follow-ups.controller';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
@Module({
  imports: [PipelinesModule],
  controllers: [LeadsController, FollowUpsController],
  providers: [LeadsService],
})
export class LeadsModule {}
