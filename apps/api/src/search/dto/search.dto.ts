import { Transform, Type } from 'class-transformer';
import { IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class SearchQueryDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  q!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  limit = 5;
}
