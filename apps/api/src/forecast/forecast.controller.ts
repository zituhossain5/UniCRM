import { Controller, Get, Inject, Query } from '@nestjs/common';
import { PERMISSIONS } from '../auth/auth.constants';
import { CurrentPrincipal, RequirePermission } from '../auth/auth.decorators';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import { ForecastQueryDto } from './dto/forecast.dto';
import { ForecastService } from './forecast.service';

@Controller('forecast')
@RequirePermission(PERMISSIONS.forecastRead)
export class ForecastController {
  constructor(@Inject(ForecastService) private readonly forecast: ForecastService) {}

  @Get()
  get(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Query() query: ForecastQueryDto) {
    return this.forecast.get(principal, query);
  }
}
