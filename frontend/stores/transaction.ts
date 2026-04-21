import { defineStore } from 'pinia'
import type {
  AdvancedFilters,
  CreateTransactionPayload,
  PaginatedResult,
  Transaction,
  TransactionQuery,
  TransactionStage,
  UpdateTransactionStagePayload,
} from '~/types'

const DEFAULT_LIMIT = 10

const EMPTY_ADVANCED_FILTERS: AdvancedFilters = {
  minTotalFee: null,
  maxTotalFee: null,
  startDate: null,
  endDate: null,
  agentId: null,
}

interface TransactionStoreState {
  transactions: Transaction[]
  total: number
  page: number
  limit: number
  totalPages: number
  search: string
  stage: TransactionStage | null
  advancedFilters: AdvancedFilters
  loading: boolean
  error: string | null
}

interface FetchOptions extends TransactionQuery {
  resetPage?: boolean
  advancedFilters?: AdvancedFilters
}

export const useTransactionStore = defineStore('transactions', {
  state: (): TransactionStoreState => ({
    transactions: [],
    total: 0,
    page: 1,
    limit: DEFAULT_LIMIT,
    totalPages: 0,
    search: '',
    stage: null,
    advancedFilters: { ...EMPTY_ADVANCED_FILTERS },
    loading: false,
    error: null,
  }),

  getters: {
    activeFilterCount: (state): number => {
      let count = 0
      if (state.search.trim().length > 0) count += 1
      if (state.stage) count += 1
      const f = state.advancedFilters
      if (f.minTotalFee !== null) count += 1
      if (f.maxTotalFee !== null) count += 1
      if (f.startDate) count += 1
      if (f.endDate) count += 1
      if (f.agentId) count += 1
      return count
    },

    activeAdvancedFilterCount: (state): number => {
      let count = 0
      const f = state.advancedFilters
      if (f.minTotalFee !== null) count += 1
      if (f.maxTotalFee !== null) count += 1
      if (f.startDate) count += 1
      if (f.endDate) count += 1
      if (f.agentId) count += 1
      return count
    },
  },

  actions: {
    async fetchTransactions(
      options: FetchOptions = {},
    ): Promise<PaginatedResult<Transaction>> {
      this.loading = true
      this.error = null
      try {
        const api = useApi()

        if ('search' in options && options.search !== undefined) {
          this.search = options.search
        }
        if ('stage' in options) {
          this.stage = options.stage ?? null
        }
        if (options.advancedFilters) {
          this.advancedFilters = { ...options.advancedFilters }
        }

        const limit = options.limit ?? this.limit
        const page = options.resetPage ? 1 : options.page ?? this.page

        const query: Record<string, string | number> = { page, limit }
        if (this.search.trim().length > 0) {
          query.search = this.search.trim()
        }
        if (this.stage) {
          query.stage = this.stage
        }
        const f = this.advancedFilters
        if (f.minTotalFee !== null) {
          query.minTotalFee = f.minTotalFee
        }
        if (f.maxTotalFee !== null) {
          query.maxTotalFee = f.maxTotalFee
        }
        if (f.startDate) {
          query.startDate = f.startDate
        }
        if (f.endDate) {
          query.endDate = f.endDate
        }
        if (f.agentId) {
          query.agentId = f.agentId
        }

        const response = await api<PaginatedResult<Transaction>>(
          '/transactions',
          { query },
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

    async fetchOne(id: string): Promise<Transaction> {
      const api = useApi()
      return api<Transaction>(`/transactions/${id}`)
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
        await this.fetchTransactions({ resetPage: true })
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

    setAdvancedFilters(
      filters: AdvancedFilters,
    ): Promise<PaginatedResult<Transaction>> {
      return this.fetchTransactions({
        advancedFilters: filters,
        resetPage: true,
      })
    },

    resetAdvancedFilters(): Promise<PaginatedResult<Transaction>> {
      return this.fetchTransactions({
        advancedFilters: { ...EMPTY_ADVANCED_FILTERS },
        resetPage: true,
      })
    },

    resetFilters(): Promise<PaginatedResult<Transaction>> {
      this.search = ''
      this.stage = null
      this.advancedFilters = { ...EMPTY_ADVANCED_FILTERS }
      return this.fetchTransactions({ resetPage: true })
    },
  },
})
