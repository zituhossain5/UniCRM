import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class PipelineStageInputDto {
  @IsUUID() @IsOptional() id?: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @IsInt() @Min(0) position!: number;
  @IsBoolean() isWon!: boolean;
  @IsBoolean() isLost!: boolean;
}
export class CreatePipelineDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsBoolean() @IsOptional() isDefault?: boolean;
  @IsArray()
  @ArrayMinSize(2)
  @ArrayUnique((stage: PipelineStageInputDto) => stage.position)
  @ValidateNested({ each: true })
  @Type(() => PipelineStageInputDto)
  stages!: PipelineStageInputDto[];
}
export class UpdatePipelineDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(120) @IsOptional() name?: string;
  @IsBoolean() @IsOptional() isDefault?: boolean;
}
export class ReplacePipelineStagesDto {
  @IsArray()
  @ArrayMinSize(2)
  @ArrayUnique((stage: PipelineStageInputDto) => stage.position)
  @ValidateNested({ each: true })
  @Type(() => PipelineStageInputDto)
  stages!: PipelineStageInputDto[];
}
