import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class ReportFilterDto {
  @IsDateString() @IsOptional() from?: string;
  @IsDateString() @IsOptional() to?: string;
  @IsUUID() @IsOptional() owner?: string;
  @IsUUID() @IsOptional() assignee?: string;
  @IsUUID() @IsOptional() company?: string;
  @IsUUID() @IsOptional() project?: string;
  @Type(() => Number) @IsInt() @Min(1) @IsOptional() page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) @IsOptional() limit = 25;
}
