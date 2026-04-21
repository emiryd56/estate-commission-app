import type { PopulatedAgent } from './user'

export enum TransactionStage {
  AGREEMENT = 'agreement',
  EARNEST_MONEY = 'earnest_money',
  TITLE_DEED = 'title_deed',
  COMPLETED = 'completed',
}

export interface FinancialBreakdown {
  companyCut?: number
  listingAgentCut?: number
  sellingAgentCut?: number
}

export interface StageHistoryEntry {
  stage: TransactionStage
  changedAt: string
}

export interface Transaction {
  _id: string
  title: string
  stage: TransactionStage
  totalFee: number
  listingAgent: PopulatedAgent
  sellingAgent: PopulatedAgent
  financialBreakdown?: FinancialBreakdown
  stageHistory: StageHistoryEntry[]
  createdAt: string
  updatedAt: string
}

export interface CreateTransactionPayload {
  title: string
  totalFee: number
  listingAgent: string
  sellingAgent: string
}

export interface UpdateTransactionStagePayload {
  stage: TransactionStage
}

export interface TransactionQuery {
  page?: number
  limit?: number
  search?: string
  stage?: TransactionStage
  minTotalFee?: number
  maxTotalFee?: number
  startDate?: string
  endDate?: string
  agentId?: string
}

export interface AdvancedFilters {
  minTotalFee: number | null
  maxTotalFee: number | null
  startDate: string | null
  endDate: string | null
  agentId: string | null
}
