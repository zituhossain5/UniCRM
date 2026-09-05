import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CurrentPrincipal } from '../auth/auth.decorators';
import { RateLimitService } from '../auth/rate-limit.service';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import type { EnvironmentVariables } from '../config/environment';
import { SearchQueryDto } from './dto/search.dto';
import { SearchService } from './search.service';

@Controller('search')
export class SearchController {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<EnvironmentVariables, true>,
    @Inject(RateLimitService) private readonly rateLimit: RateLimitService,
    @Inject(SearchService) private readonly searchService: SearchService,
  ) {}
  @Get()
  async search(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: SearchQueryDto,
  ) {
    await this.rateLimit.consume('search', `${principal.organizationId}:${principal.userId}`, {
      limit: this.config.get('SEARCH_RATE_LIMIT_MAX', { infer: true }),
      windowSeconds: this.config.get('SEARCH_RATE_LIMIT_WINDOW_SECONDS', { infer: true }),
    });
    return this.searchService.search(principal, query.q, query.limit);
  }
}
