import { IsOptional, IsString, MaxLength } from 'class-validator';

export class StartDemoDto {
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  turnstileToken?: string;
}
