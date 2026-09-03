import { Controller, Get, Inject, Query } from '@nestjs/common';
import { CurrentPrincipal } from '../auth/auth.decorators';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import { SearchQueryDto } from './dto/search.dto';
import { SearchService } from './search.service';

@Controller('search')
export class SearchController {
  constructor(@Inject(SearchService) private readonly searchService: SearchService) {}
  @Get()
  search(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Query() query: SearchQueryDto) {
    return this.searchService.search(principal, query.q, query.limit);
  }
}
