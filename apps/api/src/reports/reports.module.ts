import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ForecastModule } from '../forecast/forecast.module';

@Module({
  imports: [ForecastModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
