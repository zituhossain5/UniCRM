import { Transform } from 'class-transformer';
import { IsEnum, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { ConfigurableEntityType } from '../../generated/prisma/enums';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateTagDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(80) name!: string;
}
export class UpdateTagDto extends CreateTagDto {}
export class TagAssignmentDto {
  @IsEnum(ConfigurableEntityType) entityType!: ConfigurableEntityType;
  @IsUUID() entityId!: string;
}
