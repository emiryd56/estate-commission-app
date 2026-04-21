<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { TransactionStage } from '~/types'
import type { StageHistoryEntry, Transaction } from '~/types'
import { formatCurrency, getNextStage, STAGE_LABELS, STAGE_ORDER } from '~/utils/stage'

const route = useRoute()
const router = useRouter()
const transactionStore = useTransactionStore()
const config = useRuntimeConfig()

const transaction = ref<Transaction | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const exportLoading = ref(false)
const transitionLoading = ref(false)

const transactionId = computed(() => {
  const id = route.params.id
  return Array.isArray(id) ? id[0] : id
})

async function loadTransaction(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    transaction.value = await transactionStore.fetchOne(transactionId.value)
  } catch (err) {
    error.value = extractErrorMessage(err)
    transaction.value = null
  } finally {
    loading.value = false
  }
}

onMounted(loadTransaction)

const nextStage = computed<TransactionStage | null>(() =>
  transaction.value ? getNextStage(transaction.value.stage) : null,
)

const isCompleted = computed(
  () => transaction.value?.stage === TransactionStage.COMPLETED,
)

const stageTimeline = computed<
  Array<{
    stage: TransactionStage
    label: string
    status: 'done' | 'current' | 'pending'
    changedAt: string | null
  }>
>(() => {
  if (!transaction.value) {
    return []
  }
  const history = transaction.value.stageHistory ?? []
  const currentIndex = STAGE_ORDER.indexOf(transaction.value.stage)
  const latestByStage = new Map<TransactionStage, StageHistoryEntry>()
  for (const entry of history) {
    latestByStage.set(entry.stage, entry)
  }

  return STAGE_ORDER.map((stage, idx) => {
    const entry = latestByStage.get(stage)
    let status: 'done' | 'current' | 'pending' = 'pending'
    if (idx < currentIndex) {
      status = 'done'
    } else if (idx === currentIndex) {
      status = 'current'
    }
    return {
      stage,
      label: STAGE_LABELS[stage],
      status,
      changedAt: entry ? entry.changedAt : null,
    }
  })
})

function formatDate(value: string | Date | null): string {
  if (!value) {
    return '—'
  }
  try {
    return new Intl.DateTimeFormat('tr-TR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return String(value)
  }
}

function formatRatio(value: number | undefined | null): string {
  if (!transaction.value || transaction.value.totalFee === 0) {
    return '—'
  }
  if (value === undefined || value === null) {
    return '—'
  }
  return `%${Math.round((value / transaction.value.totalFee) * 100)}`
}

function stageBadgeClass(stage: TransactionStage): string {
  const map: Record<TransactionStage, string> = {
    [TransactionStage.AGREEMENT]: 'bg-slate-100 text-slate-700 ring-slate-200',
    [TransactionStage.EARNEST_MONEY]: 'bg-amber-50 text-amber-800 ring-amber-200',
    [TransactionStage.TITLE_DEED]: 'bg-sky-50 text-sky-800 ring-sky-200',
    [TransactionStage.COMPLETED]: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  }
  return map[stage]
}

function timelineDotClass(status: 'done' | 'current' | 'pending'): string {
  switch (status) {
    case 'done':
      return 'border-emerald-500 bg-emerald-500 text-white'
    case 'current':
      return 'border-indigo-500 bg-indigo-500 text-white'
    case 'pending':
    default:
      return 'border-slate-300 bg-white text-slate-400'
  }
}

function timelineLineClass(status: 'done' | 'current' | 'pending'): string {
  return status === 'done' ? 'bg-emerald-500' : 'bg-slate-200'
}

async function advance(): Promise<void> {
  if (!transaction.value || !nextStage.value) {
    return
  }
  transitionLoading.value = true
  try {
    const updated = await transactionStore.updateTransactionStage(
      transaction.value._id,
      nextStage.value,
    )
    transaction.value = updated
  } catch (err) {
    error.value = extractErrorMessage(err)
  } finally {
    transitionLoading.value = false
  }
}

async function downloadExport(): Promise<void> {
  if (!transaction.value) {
    return
  }
  exportLoading.value = true
  try {
    const tokenCookie = useCookie<string | null>('token')
    const url = `${config.public.apiBase}/transactions/${transaction.value._id}/export`
    const response = await fetch(url, {
      headers: tokenCookie.value
        ? { Authorization: `Bearer ${tokenCookie.value}` }
        : undefined,
    })
    if (!response.ok) {
      throw new Error(`İndirme başarısız: HTTP ${response.status}`)
    }
    const blob = await response.blob()
    const disposition = response.headers.get('Content-Disposition') ?? ''
    const match = disposition.match(/filename="?([^";]+)"?/i)
    const filename = match ? match[1] : `transaction-${transaction.value._id}.pdf`

    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(objectUrl)
  } catch (err) {
    error.value = extractErrorMessage(err)
  } finally {
    exportLoading.value = false
  }
}

function goBack(): void {
  if (window.history.length > 1) {
    router.back()
    return
  }
  void router.push('/')
}
</script>

<template>
  <div class="mx-auto max-w-4xl">
    <div class="mb-4 flex items-center gap-2">
      <button
        type="button"
        class="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-900"
        @click="goBack"
      >
        <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Panoya dön
      </button>
    </div>

    <div
      v-if="loading"
      class="rounded-lg border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm"
    >
      Yükleniyor...
    </div>

    <div
      v-else-if="error && !transaction"
      class="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-800"
    >
      {{ error }}
    </div>

    <template v-else-if="transaction">
      <header class="mb-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p class="text-xs uppercase tracking-wide text-slate-400">
              İşlem No {{ transaction._id }}
            </p>
            <h1 class="mt-1 text-2xl font-bold text-slate-900">
              {{ transaction.title }}
            </h1>
            <div class="mt-3 flex flex-wrap items-center gap-3">
              <span
                class="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset"
                :class="stageBadgeClass(transaction.stage)"
              >
                {{ STAGE_LABELS[transaction.stage] }}
              </span>
              <span class="text-xs text-slate-500">
                Oluşturma: {{ formatDate(transaction.createdAt) }}
              </span>
              <span class="text-xs text-slate-500">
                Güncelleme: {{ formatDate(transaction.updatedAt) }}
              </span>
            </div>
          </div>

          <div class="flex flex-col items-end gap-2">
            <p class="text-xs text-slate-500">Toplam Komisyon</p>
            <p class="text-2xl font-bold text-emerald-600">
              {{ formatCurrency(transaction.totalFee) }}
            </p>
          </div>
        </div>

        <div class="mt-6 grid grid-cols-1 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
          <div>
            <p class="text-xs font-medium uppercase tracking-wide text-slate-400">
              İlan Danışmanı
            </p>
            <p class="mt-1 text-sm font-semibold text-slate-900">
              {{ transaction.listingAgent.name }}
            </p>
            <p class="text-xs text-slate-500">
              {{ transaction.listingAgent.email }}
            </p>
          </div>
          <div>
            <p class="text-xs font-medium uppercase tracking-wide text-slate-400">
              Satış Danışmanı
            </p>
            <p class="mt-1 text-sm font-semibold text-slate-900">
              {{ transaction.sellingAgent.name }}
            </p>
            <p class="text-xs text-slate-500">
              {{ transaction.sellingAgent.email }}
            </p>
          </div>
        </div>

        <div class="mt-6 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          <button
            v-if="nextStage"
            type="button"
            :disabled="transitionLoading"
            class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-400"
            @click="advance"
          >
            {{ transitionLoading ? 'Güncelleniyor...' : `Sonraki Aşama: ${STAGE_LABELS[nextStage]}` }}
          </button>
          <button
            type="button"
            :disabled="exportLoading"
            class="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            @click="downloadExport"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m-9 7h12a2 2 0 002-2v-5a2 2 0 00-2-2h-3" />
            </svg>
            {{ exportLoading ? 'Hazırlanıyor...' : 'Döküman Al' }}
          </button>
        </div>
      </header>

      <section class="mb-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 class="mb-4 text-base font-semibold text-slate-900">Zaman Çizelgesi</h2>
        <ol class="space-y-4">
          <li
            v-for="(item, index) in stageTimeline"
            :key="item.stage"
            class="flex gap-4"
          >
            <div class="flex flex-col items-center">
              <div
                class="flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold"
                :class="timelineDotClass(item.status)"
              >
                <svg
                  v-if="item.status === 'done'"
                  class="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="3"
                  viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span v-else>{{ index + 1 }}</span>
              </div>
              <div
                v-if="index < stageTimeline.length - 1"
                class="mt-1 w-0.5 flex-1"
                :class="timelineLineClass(item.status)"
              />
            </div>
            <div class="flex-1 pb-4">
              <p
                class="text-sm font-semibold"
                :class="item.status === 'pending' ? 'text-slate-400' : 'text-slate-900'"
              >
                {{ item.label }}
              </p>
              <p class="text-xs text-slate-500">
                <template v-if="item.status === 'pending'">
                  Bekliyor
                </template>
                <template v-else-if="item.changedAt">
                  {{ formatDate(item.changedAt) }}
                </template>
                <template v-else>
                  —
                </template>
              </p>
            </div>
          </li>
        </ol>
      </section>

      <section
        v-if="isCompleted && transaction.financialBreakdown"
        class="rounded-lg border border-emerald-200 bg-emerald-50/50 p-6 shadow-sm"
      >
        <h2 class="mb-4 text-base font-semibold text-emerald-900">
          Finansal Hak Ediş Raporu
        </h2>
        <table class="min-w-full overflow-hidden rounded-md border border-emerald-200 bg-white">
          <thead class="bg-emerald-100">
            <tr>
              <th class="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-emerald-900">
                Kalem
              </th>
              <th class="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-emerald-900">
                Tutar
              </th>
              <th class="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-emerald-900">
                Oran
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-emerald-100 text-sm">
            <tr>
              <td class="px-4 py-2 text-slate-700">Toplam Komisyon</td>
              <td class="px-4 py-2 text-right font-semibold text-slate-900">
                {{ formatCurrency(transaction.totalFee) }}
              </td>
              <td class="px-4 py-2 text-right text-slate-500">%100</td>
            </tr>
            <tr>
              <td class="px-4 py-2 text-slate-700">Şirket Payı</td>
              <td class="px-4 py-2 text-right font-semibold text-slate-900">
                {{ formatCurrency(transaction.financialBreakdown.companyCut ?? 0) }}
              </td>
              <td class="px-4 py-2 text-right text-slate-500">
                {{ formatRatio(transaction.financialBreakdown.companyCut) }}
              </td>
            </tr>
            <tr>
              <td class="px-4 py-2 text-slate-700">
                İlan Danışmanı ({{ transaction.listingAgent.name }})
              </td>
              <td class="px-4 py-2 text-right font-semibold text-slate-900">
                {{ formatCurrency(transaction.financialBreakdown.listingAgentCut ?? 0) }}
              </td>
              <td class="px-4 py-2 text-right text-slate-500">
                {{ formatRatio(transaction.financialBreakdown.listingAgentCut) }}
              </td>
            </tr>
            <tr>
              <td class="px-4 py-2 text-slate-700">
                Satış Danışmanı ({{ transaction.sellingAgent.name }})
              </td>
              <td class="px-4 py-2 text-right font-semibold text-slate-900">
                {{ formatCurrency(transaction.financialBreakdown.sellingAgentCut ?? 0) }}
              </td>
              <td class="px-4 py-2 text-right text-slate-500">
                {{ formatRatio(transaction.financialBreakdown.sellingAgentCut) }}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <div
        v-if="error && transaction"
        class="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
      >
        {{ error }}
      </div>
    </template>
  </div>
</template>
