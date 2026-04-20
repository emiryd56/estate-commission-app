import { TransactionStage } from '~/types'

export const STAGE_LABELS: Readonly<Record<TransactionStage, string>> = {
  [TransactionStage.AGREEMENT]: 'Anlaşma',
  [TransactionStage.EARNEST_MONEY]: 'Kaparo',
  [TransactionStage.TITLE_DEED]: 'Tapu',
  [TransactionStage.COMPLETED]: 'Tamamlandı',
}

export const STAGE_ORDER: readonly TransactionStage[] = [
  TransactionStage.AGREEMENT,
  TransactionStage.EARNEST_MONEY,
  TransactionStage.TITLE_DEED,
  TransactionStage.COMPLETED,
]

export function getNextStage(
  current: TransactionStage,
): TransactionStage | null {
  const index = STAGE_ORDER.indexOf(current)
  if (index === -1 || index >= STAGE_ORDER.length - 1) {
    return null
  }
  return STAGE_ORDER[index + 1]
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 0,
  }).format(value)
}
