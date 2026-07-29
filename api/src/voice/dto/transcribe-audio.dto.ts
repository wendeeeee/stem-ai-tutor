import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsString, Max, Min } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class TranscribeAudioDto {
  @Transform(trim)
  @IsString()
  @IsIn(['en'])
  language = 'en';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120_000)
  durationMs!: number;
}
