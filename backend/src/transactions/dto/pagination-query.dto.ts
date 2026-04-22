import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { TransactionStage } from '../enums/transaction-stage.enum';

export class PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiPropertyOptional({
    description: 'Free-text search on transaction title.',
    maxLength: 120,
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  search?: string;

  @ApiPropertyOptional({ enum: TransactionStage })
  @IsOptional()
  @IsEnum(TransactionStage)
  stage?: TransactionStage;

  @ApiPropertyOptional({ minimum: 0, description: 'Minimum total fee filter.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minTotalFee?: number;

  @ApiPropertyOptional({ minimum: 0, description: 'Maximum total fee filter.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxTotalFee?: number;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Filter transactions created on or after this ISO date.',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Filter transactions created on or before this ISO date.',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description:
      'Restrict results to transactions involving this agent (admin only).',
  })
  @IsOptional()
  @IsMongoId()
  agentId?: string;
}
