import { Controller, Get, Inject } from '@nestjs/common';
import type { HealthResponse } from '@unicrm/types';
import { Public } from '../auth/auth.decorators';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(@Inject(HealthService) private readonly healthService: HealthService) {}

  @Get()
  @Public()
  check(): Promise<HealthResponse> {
    return this.healthService.check();
  }

  @Get('live')
  @Public()
  live() {
    return this.healthService.live();
  }

  @Get('ready')
  @Public()
  ready(): Promise<HealthResponse> {
    return this.healthService.ready();
  }
}
