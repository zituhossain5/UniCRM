import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class ForecastQueryDto {
  @IsIn(['month', 'quarter', 'custom']) @IsOptional() period: 'month' | 'quarter' | 'custom' =
    'month';
  @IsDateString() @IsOptional() from?: string;
  @IsDateString() @IsOptional() to?: string;
  @IsUUID() @IsOptional() owner?: string;
  @IsUUID() @IsOptional() pipeline?: string;
  @IsUUID() @IsOptional() stage?: string;
  @IsIn(['all', 'open', 'won', 'lost']) @IsOptional() state: 'all' | 'open' | 'won' | 'lost' =
    'all';
  @IsIn(['week', 'month', 'quarter']) @IsOptional() groupBy: 'week' | 'month' | 'quarter' = 'month';
  @IsIn(['name', 'amount', 'probability', 'weightedValue', 'expectedCloseDate', 'daysInStage'])
  @IsOptional()
  sort = 'expectedCloseDate';
  @IsIn(['asc', 'desc']) @IsOptional() order: 'asc' | 'desc' = 'asc';
  @IsString() @IsOptional() search?: string;
  @Type(() => Number) @IsInt() @Min(1) @IsOptional() page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) @IsOptional() limit = 25;
}
