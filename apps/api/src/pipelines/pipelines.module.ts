import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PipelinesController } from './pipelines.controller';
import { PipelinesService } from './pipelines.service';
@Module({
  imports: [AuditModule],
  controllers: [PipelinesController],
  exports: [PipelinesService],
  providers: [PipelinesService],
})
export class PipelinesModule {}
