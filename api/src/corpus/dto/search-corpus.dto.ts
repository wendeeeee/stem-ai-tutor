import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class SearchCorpusDto {
  @IsString()
  @Length(2, 2000)
  query!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit = 5;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  threshold = 0.65;

  @IsOptional()
  @IsString()
  @Length(2, 150)
  subject?: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  schoolLevel?: string;
}
