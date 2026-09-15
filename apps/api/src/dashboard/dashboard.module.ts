import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { ForecastModule } from '../forecast/forecast.module';

@Module({
  imports: [ForecastModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
