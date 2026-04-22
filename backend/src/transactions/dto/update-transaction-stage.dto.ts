import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { TransactionStage } from '../enums/transaction-stage.enum';

export class UpdateTransactionStageDto {
  @ApiProperty({
    enum: TransactionStage,
    description:
      'Target stage. Must be the direct next stage of the current one.',
    example: TransactionStage.EARNEST_MONEY,
  })
  @IsEnum(TransactionStage)
  stage!: TransactionStage;
}
