import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import {
  OutputLanguage,
  supportedOutputLanguages,
} from '../translation/translation.contracts';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateTutorRunDto {
  @Transform(trim)
  @IsString()
  @Length(2, 2000)
  question!: string;

  @Transform(trim)
  @IsString()
  @IsIn(['en'])
  language = 'en';

  @Transform(trim)
  @IsString()
  @IsIn(supportedOutputLanguages)
  preferredLanguage?: OutputLanguage = 'pcm';

  @Transform(trim)
  @IsOptional()
  @IsUUID()
  voiceSessionId?: string;
}
