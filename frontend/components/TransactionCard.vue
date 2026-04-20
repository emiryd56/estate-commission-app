<script setup lang="ts">
import { computed, ref } from 'vue'
import { TransactionStage } from '~/types'
import type { Transaction } from '~/types'
import { formatCurrency, getNextStage, STAGE_LABELS } from '~/utils/stage'

interface Props {
  transaction: Transaction
}

const props = defineProps<Props>()

const transactionStore = useTransactionStore()

const isCompleted = computed(
  () => props.transaction.stage === TransactionStage.COMPLETED,
)

const nextStage = computed(() => getNextStage(props.transaction.stage))

const nextStageLabel = computed(() =>
  nextStage.value ? STAGE_LABELS[nextStage.value] : null,
)

const isUpdating = ref(false)

async function handleAdvance(): Promise<void> {
  if (!nextStage.value || isUpdating.value) {
    return
  }
  isUpdating.value = true
  try {
    await transactionStore.updateTransactionStage(
      props.transaction._id,
      nextStage.value,
    )
  } catch {
    // Error already captured in store.error
  } finally {
    isUpdating.value = false
  }
}
</script>

<template>
  <article
    class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
  >
    <header class="mb-3">
      <h3 class="text-sm font-semibold text-slate-900">
        {{ transaction.title }}
      </h3>
      <p class="mt-1 text-xs text-slate-500">
        <span class="font-medium text-slate-600">İlan:</span>
        {{ transaction.listingAgent.name }}
        <span class="mx-1 text-slate-300">·</span>
        <span class="font-medium text-slate-600">Satış:</span>
        {{ transaction.sellingAgent.name }}
      </p>
    </header>

    <div class="mb-4">
      <p class="text-xs uppercase tracking-wide text-slate-400">Komisyon</p>
      <p class="text-lg font-bold text-emerald-600">
        {{ formatCurrency(transaction.totalFee) }}
      </p>
    </div>

    <div
      v-if="isCompleted && transaction.financialBreakdown"
      class="rounded-md border border-emerald-100 bg-emerald-50 p-3 text-xs"
    >
      <p class="mb-2 font-semibold uppercase tracking-wide text-emerald-800">
        Finansal Döküm
      </p>
      <dl class="space-y-1.5">
        <div class="flex items-center justify-between">
          <dt class="text-slate-600">Şirket Payı</dt>
          <dd class="font-semibold text-slate-900">
            {{ formatCurrency(transaction.financialBreakdown.companyCut ?? 0) }}
          </dd>
        </div>
        <div class="flex items-center justify-between">
          <dt class="text-slate-600">
            İlan Danışmanı
            <span class="text-slate-400">
              ({{ transaction.listingAgent.name }})
            </span>
          </dt>
          <dd class="font-semibold text-slate-900">
            {{
              formatCurrency(
                transaction.financialBreakdown.listingAgentCut ?? 0,
              )
            }}
          </dd>
        </div>
        <div class="flex items-center justify-between">
          <dt class="text-slate-600">
            Satış Danışmanı
            <span class="text-slate-400">
              ({{ transaction.sellingAgent.name }})
            </span>
          </dt>
          <dd class="font-semibold text-slate-900">
            {{
              formatCurrency(
                transaction.financialBreakdown.sellingAgentCut ?? 0,
              )
            }}
          </dd>
        </div>
      </dl>
    </div>

    <button
      v-else-if="nextStage"
      type="button"
      :disabled="isUpdating"
      class="w-full rounded-md bg-indigo-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:bg-indigo-400"
      @click="handleAdvance"
    >
      <span v-if="isUpdating">Güncelleniyor...</span>
      <span v-else>Sonraki Aşama: {{ nextStageLabel }}</span>
    </button>
  </article>
</template>
