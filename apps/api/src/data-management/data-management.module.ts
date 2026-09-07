import { Module } from '@nestjs/common';
import { PipelinesModule } from '../pipelines/pipelines.module';
import { DataManagementController } from './data-management.controller';
import { DataManagementService } from './data-management.service';

@Module({
  imports: [PipelinesModule],
  controllers: [DataManagementController],
  providers: [DataManagementService],
})
export class DataManagementModule {}
