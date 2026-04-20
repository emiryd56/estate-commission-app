import { defineStore } from 'pinia'
import type {
  CreateTransactionPayload,
  PaginatedResult,
  PaginationQuery,
  Transaction,
  TransactionStage,
  UpdateTransactionStagePayload,
} from '~/types'

const DEFAULT_LIMIT = 10

interface TransactionStoreState {
  transactions: Transaction[]
  total: number
  page: number
  limit: number
  totalPages: number
  loading: boolean
  error: string | null
}

export const useTransactionStore = defineStore('transactions', {
  state: (): TransactionStoreState => ({
    transactions: [],
    total: 0,
    page: 1,
    limit: DEFAULT_LIMIT,
    totalPages: 0,
    loading: false,
    error: null,
  }),

  actions: {
    async fetchTransactions(
      query: PaginationQuery = {},
    ): Promise<PaginatedResult<Transaction>> {
      this.loading = true
      this.error = null
      try {
        const api = useApi()
        const page = query.page ?? this.page
        const limit = query.limit ?? this.limit
        const response = await api<PaginatedResult<Transaction>>(
          '/transactions',
          {
            query: { page, limit },
          },
        )
        this.transactions = response.data
        this.total = response.total
        this.page = response.page
        this.limit = limit
        this.totalPages = response.totalPages
        return response
      } catch (err) {
        this.error = extractErrorMessage(err)
        throw err
      } finally {
        this.loading = false
      }
    },

    async createTransaction(
      payload: CreateTransactionPayload,
    ): Promise<Transaction> {
      this.loading = true
      this.error = null
      try {
        const api = useApi()
        const created = await api<Transaction>('/transactions', {
          method: 'POST',
          body: payload,
        })
        await this.fetchTransactions({ page: 1 })
        return created
      } catch (err) {
        this.error = extractErrorMessage(err)
        throw err
      } finally {
        this.loading = false
      }
    },

    async updateTransactionStage(
      id: string,
      stage: TransactionStage,
    ): Promise<Transaction> {
      this.loading = true
      this.error = null
      try {
        const api = useApi()
        const payload: UpdateTransactionStagePayload = { stage }
        const updated = await api<Transaction>(`/transactions/${id}/stage`, {
          method: 'PATCH',
          body: payload,
        })
        this.transactions = this.transactions.map((t) =>
          t._id === id ? updated : t,
        )
        return updated
      } catch (err) {
        this.error = extractErrorMessage(err)
        throw err
      } finally {
        this.loading = false
      }
    },

    setPage(page: number): Promise<PaginatedResult<Transaction>> {
      return this.fetchTransactions({ page })
    },
  },
})
