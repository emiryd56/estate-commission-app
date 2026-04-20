<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { TransactionStage } from '~/types'
import { STAGE_LABELS, STAGE_ORDER } from '~/utils/stage'

const transactionStore = useTransactionStore()

const totalCount = computed(() => transactionStore.transactions.length)
const isLoading = computed(() => transactionStore.loading)
const errorMessage = computed(() => transactionStore.error)

onMounted(async () => {
  await transactionStore.fetchTransactions()
})

function stageColumnBadgeClass(stage: TransactionStage): string {
  const classes: Record<TransactionStage, string> = {
    [TransactionStage.AGREEMENT]: 'bg-slate-200 text-slate-700',
    [TransactionStage.EARNEST_MONEY]: 'bg-amber-100 text-amber-800',
    [TransactionStage.TITLE_DEED]: 'bg-sky-100 text-sky-800',
    [TransactionStage.COMPLETED]: 'bg-emerald-100 text-emerald-800',
  }
  return classes[stage]
}
</script>

<template>
  <div>
    <header class="mb-8 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <h1 class="text-2xl font-bold text-slate-900">İşlem Panosu</h1>
        <span
          class="inline-flex items-center rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-800"
        >
          {{ totalCount }} İşlem
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
      class="mb-6 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"
    >
      {{ errorMessage }}
    </div>

    <div v-if="isLoading && totalCount === 0" class="text-sm text-slate-500">
      Yükleniyor...
    </div>

    <div class="grid grid-cols-4 gap-4">
      <section
        v-for="stage in STAGE_ORDER"
        :key="stage"
        class="rounded-xl bg-slate-100 p-4"
      >
        <header class="mb-4 flex items-center justify-between">
          <h2 class="text-sm font-semibold text-slate-700">
            {{ STAGE_LABELS[stage] }}
          </h2>
          <span
            class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
            :class="stageColumnBadgeClass(stage)"
          >
            {{ transactionStore.byStage(stage).length }}
          </span>
        </header>

        <div class="space-y-3">
          <TransactionCard
            v-for="transaction in transactionStore.byStage(stage)"
            :key="transaction._id"
            :transaction="transaction"
          />

          <p
            v-if="transactionStore.byStage(stage).length === 0"
            class="py-6 text-center text-xs text-slate-400"
          >
            İşlem yok
          </p>
        </div>
      </section>
    </div>
  </div>
</template>
