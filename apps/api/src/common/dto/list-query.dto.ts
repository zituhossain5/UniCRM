import { BadRequestException } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ListQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit = 25;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  search?: string;

  @IsIn(['asc', 'desc'])
  @IsOptional()
  order: 'asc' | 'desc' = 'desc';
}

export function paginationMeta(page: number, limit: number, total: number) {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

export function normalizeListQuery<TSort extends string>(
  query: Partial<ListQueryDto> & { sort?: string },
  defaultSort: TSort,
  allowedSorts: readonly TSort[],
) {
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 25);
  if (!Number.isInteger(page) || page < 1)
    throw new BadRequestException('page must be a positive integer');
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new BadRequestException('limit must be an integer between 1 and 100');
  if (query.sort && !allowedSorts.includes(query.sort as TSort))
    throw new BadRequestException('Unsupported sort field');
  if (query.order !== undefined && query.order !== 'asc' && query.order !== 'desc')
    throw new BadRequestException('order must be asc or desc');
  const sort = query.sort ? (query.sort as TSort) : defaultSort;
  const order = query.order === 'asc' || query.order === 'desc' ? query.order : 'desc';

  return {
    page,
    limit,
    order,
    search: typeof query.search === 'string' ? query.search.trim() : undefined,
    sort,
  };
}
