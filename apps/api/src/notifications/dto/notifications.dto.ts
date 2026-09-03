import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class NotificationListQueryDto {
  @Type(() => Number) @IsInt() @Min(1) @IsOptional() page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) @IsOptional() limit = 25;
  @Type(() => Boolean) @IsBoolean() @IsOptional() unread?: boolean;
}
