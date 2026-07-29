import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, Length } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class SubmitReinforcementAnswerDto {
  @Transform(trim)
  @IsUUID()
  questionId!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 1000)
  answer!: string;

  @Transform(trim)
  @IsOptional()
  @IsUUID()
  voiceSessionId?: string;
}
