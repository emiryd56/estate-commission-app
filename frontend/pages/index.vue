<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { TransactionStage } from '~/types'
import type { Transaction } from '~/types'
import { formatCurrency, getNextStage, STAGE_LABELS } from '~/utils/stage'

const transactionStore = useTransactionStore()

const isLoading = computed(() => transactionStore.loading)
const errorMessage = computed(() => transactionStore.error)
const rows = computed(() => transactionStore.transactions)
const totalPages = computed(() => transactionStore.totalPages)
const currentPage = computed(() => transactionStore.page)
const total = computed(() => transactionStore.total)

const pageStart = computed(() =>
  total.value === 0 ? 0 : (currentPage.value - 1) * transactionStore.limit + 1,
)
const pageEnd = computed(() =>
  Math.min(currentPage.value * transactionStore.limit, total.value),
)

onMounted(async () => {
  await transactionStore.fetchTransactions({ page: 1 })
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
    // error visible in banner
  }
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
              Henüz işlem yok.
            </td>
          </tr>
          <tr
            v-for="transaction in rows"
            v-else
            :key="transaction._id"
            class="transition-colors hover:bg-slate-50"
          >
            <td class="px-6 py-4">
              <p class="text-sm font-semibold text-slate-900">
                {{ transaction.title }}
              </p>
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
              <button
                v-if="transaction.stage !== TransactionStage.COMPLETED"
                type="button"
                :disabled="isLoading"
                class="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-400"
                @click="advanceStage(transaction)"
              >
                Sonraki Aşama
              </button>
              <NuxtLink
                v-else
                :to="`/transactions/${transaction._id}`"
                class="text-xs font-medium text-indigo-600 hover:text-indigo-800"
              >
                Detay
              </NuxtLink>
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
