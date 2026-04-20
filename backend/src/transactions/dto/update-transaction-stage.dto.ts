import { IsEnum } from 'class-validator';
import { TransactionStage } from '../enums/transaction-stage.enum';

export class UpdateTransactionStageDto {
  @IsEnum(TransactionStage)
  stage!: TransactionStage;
}
