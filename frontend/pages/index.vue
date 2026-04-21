<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { TransactionStage } from '~/types'
import type { AdvancedFilters, Transaction } from '~/types'
import type { SearchableSelectOption } from '~/components/SearchableSelect.vue'
import { formatCurrency, getNextStage, STAGE_LABELS, STAGE_ORDER } from '~/utils/stage'

const SEARCH_DEBOUNCE_MS = 500

const transactionStore = useTransactionStore()
const userStore = useUserStore()
const authStore = useAuthStore()

const searchInput = ref(transactionStore.search)
const stageFilter = ref<TransactionStage | ''>(transactionStore.stage ?? '')
let searchTimer: ReturnType<typeof setTimeout> | null = null

const advancedPanelOpen = ref(false)

interface AdvancedDraft {
  minTotalFee: string
  maxTotalFee: string
  startDate: string
  endDate: string
  agentId: string
}

const advancedDraft = reactive<AdvancedDraft>({
  minTotalFee: '',
  maxTotalFee: '',
  startDate: '',
  endDate: '',
  agentId: '',
})

const advancedError = ref<string | null>(null)

const isLoading = computed(() => transactionStore.loading)
const errorMessage = computed(() => transactionStore.error)
const rows = computed(() => transactionStore.transactions)
const totalPages = computed(() => transactionStore.totalPages)
const currentPage = computed(() => transactionStore.page)
const total = computed(() => transactionStore.total)
const activeFilterCount = computed(() => transactionStore.activeFilterCount)
const advancedFilterCount = computed(
  () => transactionStore.activeAdvancedFilterCount,
)
const hasActiveFilters = computed(() => activeFilterCount.value > 0)
const agents = computed(() => userStore.users)

const agentOptions = computed<SearchableSelectOption[]>(() =>
  agents.value.map((agent) => ({
    value: agent._id,
    label: agent.name,
    sublabel: agent.email,
  })),
)

const selectedAgentId = computed<string | null>({
  get: () => (advancedDraft.agentId.length > 0 ? advancedDraft.agentId : null),
  set: (value) => {
    advancedDraft.agentId = value ?? ''
  },
})

const pageStart = computed(() =>
  total.value === 0 ? 0 : (currentPage.value - 1) * transactionStore.limit + 1,
)
const pageEnd = computed(() =>
  Math.min(currentPage.value * transactionStore.limit, total.value),
)

function syncDraftFromStore(): void {
  const f = transactionStore.advancedFilters
  advancedDraft.minTotalFee = f.minTotalFee !== null ? String(f.minTotalFee) : ''
  advancedDraft.maxTotalFee = f.maxTotalFee !== null ? String(f.maxTotalFee) : ''
  advancedDraft.startDate = f.startDate ?? ''
  advancedDraft.endDate = f.endDate ?? ''
  advancedDraft.agentId = f.agentId ?? ''
}

onMounted(async () => {
  const loadUsers = authStore.isAdmin ? userStore.fetchUsers() : Promise.resolve()
  await Promise.all([
    transactionStore.fetchTransactions({ resetPage: true }),
    loadUsers,
  ])
  syncDraftFromStore()
})

watch(searchInput, (next) => {
  if (searchTimer !== null) {
    clearTimeout(searchTimer)
  }
  searchTimer = setTimeout(() => {
    searchTimer = null
    if (next === transactionStore.search) {
      return
    }
    void transactionStore.fetchTransactions({
      search: next,
      resetPage: true,
    })
  }, SEARCH_DEBOUNCE_MS)
})

watch(stageFilter, (next) => {
  const nextStage = next === '' ? undefined : next
  void transactionStore.fetchTransactions({
    stage: nextStage,
    resetPage: true,
  })
})

function stageBadgeClass(stage: TransactionStage): string {
  const map: Record<TransactionStage, string> = {
    [TransactionStage.AGREEMENT]: 'bg-slate-100 text-slate-700 ring-slate-200',
    [TransactionStage.EARNEST_MONEY]: 'bg-amber-50 text-amber-800 ring-amber-200',
    [TransactionStage.TITLE_DEED]: 'bg-sky-50 text-sky-800 ring-sky-200',
    [TransactionStage.COMPLETED]: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  }
  return map[stage]
}

async function goToPage(page: number): Promise<void> {
  if (page < 1 || page > totalPages.value || page === currentPage.value) {
    return
  }
  await transactionStore.setPage(page)
}

async function advanceStage(transaction: Transaction): Promise<void> {
  const next = getNextStage(transaction.stage)
  if (!next) {
    return
  }
  try {
    await transactionStore.updateTransactionStage(transaction._id, next)
  } catch {
    // error banner zaten güncellendi
  }
}

async function clearFilters(): Promise<void> {
  searchInput.value = ''
  stageFilter.value = ''
  if (searchTimer !== null) {
    clearTimeout(searchTimer)
    searchTimer = null
  }
  await transactionStore.resetFilters()
  syncDraftFromStore()
}

function toggleAdvancedPanel(): void {
  if (!advancedPanelOpen.value) {
    syncDraftFromStore()
    advancedError.value = null
  }
  advancedPanelOpen.value = !advancedPanelOpen.value
}

function parseOptionalNumber(value: string): number | null {
  if (value.trim().length === 0) {
    return null
  }
  const parsed = Number(value)
  return Number.isNaN(parsed) ? null : parsed
}

function buildFiltersFromDraft(): AdvancedFilters | null {
  const min = parseOptionalNumber(advancedDraft.minTotalFee)
  const max = parseOptionalNumber(advancedDraft.maxTotalFee)
  const startDate = advancedDraft.startDate || null
  const endDate = advancedDraft.endDate || null
  const agentId = advancedDraft.agentId || null

  if (min !== null && min < 0) {
    advancedError.value = 'Min. fiyat 0 veya daha büyük olmalı'
    return null
  }
  if (max !== null && max < 0) {
    advancedError.value = 'Maks. fiyat 0 veya daha büyük olmalı'
    return null
  }
  if (min !== null && max !== null && min > max) {
    advancedError.value = 'Min. fiyat, Maks. fiyattan büyük olamaz'
    return null
  }
  if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
    advancedError.value = 'Başlangıç tarihi, bitiş tarihinden sonra olamaz'
    return null
  }

  advancedError.value = null
  return {
    minTotalFee: min,
    maxTotalFee: max,
    startDate,
    endDate,
    agentId,
  }
}

async function applyAdvancedFilters(): Promise<void> {
  const filters = buildFiltersFromDraft()
  if (!filters) {
    return
  }
  try {
    await transactionStore.setAdvancedFilters(filters)
    advancedPanelOpen.value = false
  } catch {
    // store.error handled by banner
  }
}

async function resetAdvancedFilters(): Promise<void> {
  advancedDraft.minTotalFee = ''
  advancedDraft.maxTotalFee = ''
  advancedDraft.startDate = ''
  advancedDraft.endDate = ''
  advancedDraft.agentId = ''
  advancedError.value = null
  await transactionStore.resetAdvancedFilters()
}
</script>

<template>
  <div>
    <header class="mb-6 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <h1 class="text-2xl font-bold text-slate-900">İşlem Panosu</h1>
        <span
          class="inline-flex items-center rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-800"
        >
          {{ total }} İşlem
        </span>
      </div>
      <NuxtLink
        to="/transactions/new"
        class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700"
      >
        + Yeni İşlem
      </NuxtLink>
    </header>

    <div class="mb-4 rounded-lg border border-slate-200 bg-white shadow-sm">
      <div class="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <div class="flex-1">
          <label for="search" class="mb-1 block text-xs font-medium text-slate-600">
            İşlem Ara
          </label>
          <div class="relative">
            <svg
              class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              id="search"
              v-model="searchInput"
              type="search"
              placeholder="İşlem başlığına göre ara..."
              class="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            >
          </div>
        </div>

        <div class="sm:w-48">
          <label for="stage" class="mb-1 block text-xs font-medium text-slate-600">
            Aşama Seç
          </label>
          <select
            id="stage"
            v-model="stageFilter"
            class="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          >
            <option value="">Tüm aşamalar</option>
            <option v-for="stage in STAGE_ORDER" :key="stage" :value="stage">
              {{ STAGE_LABELS[stage] }}
            </option>
          </select>
        </div>

        <button
          type="button"
          class="inline-flex h-9 items-center gap-2 self-end rounded-md border px-3 text-xs font-semibold transition-colors"
          :class="
            advancedPanelOpen
              ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
          "
          @click="toggleAdvancedPanel"
        >
          <svg
            class="h-4 w-4"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M3 4h18M6 8h12M10 12h4M8 16h8"
            />
          </svg>
          Gelişmiş Filtreleme
          <span
            v-if="advancedFilterCount > 0"
            class="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-600 px-1.5 text-[10px] font-bold text-white"
          >
            {{ advancedFilterCount }}
          </span>
          <svg
            class="h-3 w-3 transition-transform"
            :class="advancedPanelOpen ? 'rotate-180' : ''"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <button
          v-if="hasActiveFilters"
          type="button"
          class="h-9 self-end rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
          @click="clearFilters"
        >
          Tümünü Temizle
        </button>
      </div>

      <div
        v-if="advancedPanelOpen"
        class="border-t border-slate-200 bg-slate-50/70 p-5"
      >
        <div class="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          <div>
            <label class="mb-1 block text-xs font-medium text-slate-600">
              Fiyat Aralığı (₺)
            </label>
            <div class="flex items-center gap-2">
              <input
                v-model="advancedDraft.minTotalFee"
                type="number"
                min="0"
                step="1000"
                placeholder="Min"
                class="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              >
              <span class="text-slate-400">—</span>
              <input
                v-model="advancedDraft.maxTotalFee"
                type="number"
                min="0"
                step="1000"
                placeholder="Maks"
                class="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              >
            </div>
          </div>

          <div>
            <label class="mb-1 block text-xs font-medium text-slate-600">
              Tarih Aralığı
            </label>
            <div class="flex items-center gap-2">
              <input
                v-model="advancedDraft.startDate"
                type="date"
                class="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              >
              <span class="text-slate-400">—</span>
              <input
                v-model="advancedDraft.endDate"
                type="date"
                class="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              >
            </div>
          </div>

          <div v-if="authStore.isAdmin">
            <label class="mb-1 block text-xs font-medium text-slate-600">
              Danışman
            </label>
            <SearchableSelect
              v-model="selectedAgentId"
              :options="agentOptions"
              placeholder="Tüm danışmanlar"
              search-placeholder="Danışman ara (isim / e-posta)..."
              empty-text="Eşleşen danışman bulunamadı"
            />
          </div>
        </div>

        <div
          v-if="advancedError"
          class="mt-4 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700"
        >
          {{ advancedError }}
        </div>

        <div class="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            class="rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
            @click="resetAdvancedFilters"
          >
            Sıfırla
          </button>
          <button
            type="button"
            class="rounded-md bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-700"
            @click="applyAdvancedFilters"
          >
            Uygula
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="errorMessage"
      class="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
    >
      {{ errorMessage }}
    </div>

    <div class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <table class="min-w-full divide-y divide-slate-200">
        <thead class="bg-slate-50">
          <tr>
            <th scope="col" class="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              İşlem Adı
            </th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              İlan Danışmanı
            </th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Satış Danışmanı
            </th>
            <th scope="col" class="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
              Toplam Komisyon
            </th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Aşama
            </th>
            <th scope="col" class="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
              İşlem
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 bg-white">
          <tr v-if="isLoading && rows.length === 0">
            <td colspan="6" class="px-6 py-10 text-center text-sm text-slate-500">
              Yükleniyor...
            </td>
          </tr>
          <tr v-else-if="rows.length === 0">
            <td colspan="6" class="px-6 py-10 text-center text-sm text-slate-500">
              {{ hasActiveFilters ? 'Filtreye uyan işlem bulunamadı.' : 'Henüz işlem yok.' }}
            </td>
          </tr>
          <tr
            v-for="transaction in rows"
            v-else
            :key="transaction._id"
            class="transition-colors hover:bg-slate-50"
          >
            <td class="px-6 py-4">
              <NuxtLink
                :to="`/transactions/${transaction._id}`"
                class="text-sm font-semibold text-slate-900 hover:text-indigo-600"
              >
                {{ transaction.title }}
              </NuxtLink>
            </td>
            <td class="px-6 py-4 text-sm text-slate-700">
              {{ transaction.listingAgent.name }}
            </td>
            <td class="px-6 py-4 text-sm text-slate-700">
              {{ transaction.sellingAgent.name }}
            </td>
            <td class="px-6 py-4 text-right text-sm font-semibold text-emerald-600">
              {{ formatCurrency(transaction.totalFee) }}
            </td>
            <td class="px-6 py-4">
              <span
                class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset"
                :class="stageBadgeClass(transaction.stage)"
              >
                {{ STAGE_LABELS[transaction.stage] }}
              </span>
            </td>
            <td class="px-6 py-4 text-right">
              <div class="flex items-center justify-end gap-2">
                <button
                  v-if="transaction.stage !== TransactionStage.COMPLETED"
                  type="button"
                  :disabled="isLoading"
                  class="inline-flex h-8 items-center whitespace-nowrap rounded-md bg-indigo-600 px-3 text-xs font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-400"
                  @click="advanceStage(transaction)"
                >
                  Sonraki Aşama
                </button>
                <NuxtLink
                  :to="`/transactions/${transaction._id}`"
                  class="inline-flex h-8 items-center whitespace-nowrap rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
                >
                  Detay
                </NuxtLink>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <footer
        v-if="totalPages > 0"
        class="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-3"
      >
        <p class="text-xs text-slate-600">
          <span class="font-semibold">{{ pageStart }}</span>
          –
          <span class="font-semibold">{{ pageEnd }}</span>
          /
          <span class="font-semibold">{{ total }}</span>
          kayıt
        </p>
        <nav class="flex items-center gap-1">
          <button
            type="button"
            :disabled="currentPage === 1 || isLoading"
            class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            @click="goToPage(currentPage - 1)"
          >
            Önceki
          </button>
          <span class="px-3 text-xs text-slate-600">
            Sayfa <strong>{{ currentPage }}</strong> / {{ totalPages }}
          </span>
          <button
            type="button"
            :disabled="currentPage === totalPages || isLoading"
            class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            @click="goToPage(currentPage + 1)"
          >
            Sonraki
          </button>
        </nav>
      </footer>
    </div>
  </div>
</template>
