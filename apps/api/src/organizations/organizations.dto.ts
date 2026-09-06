import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class UpdateOrganizationDto {
  @IsString()
  @MinLength(2)
  @IsOptional()
  name?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^[A-Z]{3}$/)
  @IsOptional()
  defaultCurrency?: string;
}
