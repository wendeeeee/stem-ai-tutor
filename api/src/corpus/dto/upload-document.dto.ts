import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUrl, Length } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class UploadDocumentDto {
  @Transform(trim)
  @IsString()
  @Length(2, 150)
  subject!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 80)
  schoolLevel!: string;

  @Transform(trim)
  @IsString()
  @Length(2, 100)
  curriculum!: string;

  @Transform(trim)
  @IsString()
  @Length(2, 300)
  sourceTitle!: string;

  @Transform(trim)
  @IsString()
  @Length(2, 200)
  licence!: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(2, 300)
  author?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(2, 300)
  publisher?: string;

  @Transform(trim)
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @Length(5, 1000)
  sourceUrl?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(2, 250)
  topicLabel?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(1, 80)
  topicCode?: string;
}
