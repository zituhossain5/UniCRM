import { Module } from '@nestjs/common';
import { PipelinesController } from './pipelines.controller';
import { PipelinesService } from './pipelines.service';
@Module({
  controllers: [PipelinesController],
  exports: [PipelinesService],
  providers: [PipelinesService],
})
export class PipelinesModule {}
