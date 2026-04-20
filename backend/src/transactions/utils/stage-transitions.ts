import { TransactionStage } from '../enums/transaction-stage.enum';

const ALLOWED_TRANSITIONS: Readonly<Record<TransactionStage, TransactionStage[]>> = {
  [TransactionStage.AGREEMENT]: [TransactionStage.EARNEST_MONEY],
  [TransactionStage.EARNEST_MONEY]: [TransactionStage.TITLE_DEED],
  [TransactionStage.TITLE_DEED]: [TransactionStage.COMPLETED],
  [TransactionStage.COMPLETED]: [],
};

export function canTransition(
  current: TransactionStage,
  next: TransactionStage,
): boolean {
  return ALLOWED_TRANSITIONS[current].includes(next);
}
