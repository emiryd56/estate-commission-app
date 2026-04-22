<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { Transaction } from '~/types'
import { formatCurrency } from '~/utils/currency'
import { formatShortDate } from '~/utils/date'
import {
  getNextStage,
  STAGE_BADGE_CLASS,
  STAGE_LABELS,
} from '~/utils/stage'

const transactionStore = useTransactionStore()
const authStore = useAuthStore()

const loadingInitial = ref(true)

onMounted(async () => {
  try {
    await transactionStore.fetchStats({ force: true })
  } finally {
    loadingInitial.value = false
  }
})

const stats = computed(() => transactionStore.stats)
const isAdmin = computed(() => authStore.isAdmin)
const userName = computed(() => authStore.user?.name ?? '')

const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 6) return 'Good night'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
})

const earningsSubtitle = computed(() =>
  stats.value?.earnings.scope === 'company'
    ? 'Company earnings (from completed transactions)'
    : 'Your personal earnings (from completed transactions)',
)

const monthLabel = computed(() => {
  const now = new Date()
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
  }).format(now)
})

const activeAssignments = computed<Transaction[]>(
  () => stats.value?.activeRecent ?? [],
)

const stageDialogOpen = ref(false)
const stageDialogLoading = ref(false)
const pendingTransaction = ref<Transaction | null>(null)

const pendingNextStage = computed(() =>
  pendingTransaction.value ? getNextStage(pendingTransaction.value.stage) : null,
)

function requestStageAdvance(transaction: Transaction): void {
  if (!getNextStage(transaction.stage)) return
  pendingTransaction.value = transaction
  stageDialogOpen.value = true
}

async function confirmStageAdvance(): Promise<void> {
  if (!pendingTransaction.value || !pendingNextStage.value) {
    return
  }
  stageDialogLoading.value = true
  try {
    await transactionStore.updateTransactionStage(
      pendingTransaction.value._id,
      pendingNextStage.value,
    )
    stageDialogOpen.value = false
    pendingTransaction.value = null
    // Stats are invalidated by the store; refresh eagerly so the dashboard
    // stays accurate without a reload.
    await transactionStore.fetchStats({ force: true })
  } finally {
    stageDialogLoading.value = false
  }
}
</script>

<template>
  <div>
    <header class="mb-6 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p class="text-xs font-medium uppercase tracking-wide text-slate-500">
          {{ isAdmin ? 'Admin dashboard' : 'Agent dashboard' }}
        </p>
        <h1 class="mt-1 text-2xl font-bold text-slate-900">
          {{ greeting }}<template v-if="userName">, {{ userName }}</template>.
        </h1>
        <p class="mt-1 text-sm text-slate-500">
          <template v-if="isAdmin">
            Here is a snapshot of the entire office.
          </template>
          <template v-else>
            Track your transactions and earnings at a glance.
          </template>
        </p>
      </div>
      <NuxtLink
        to="/transactions/new"
        class="self-start rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 sm:self-auto"
      >
        + New transaction
      </NuxtLink>
    </header>

    <!-- Loading / empty states -->
    <div
      v-if="loadingInitial && !stats"
      class="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm"
    >
      Loading dashboard...
    </div>

    <template v-else-if="stats">
      <!-- KPI row -->
      <section class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          label="Total transactions"
          :value="String(stats.breakdown.total)"
          :sublabel="
            isAdmin
              ? `${stats.breakdown.active} active · ${stats.breakdown.completed} completed`
              : `${stats.breakdown.active} in progress`
          "
          accent="bg-indigo-50 text-indigo-600"
          icon="M9 17v-2a4 4 0 014-4h4m-7-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
        <StatCard
          label="Active transactions"
          :value="String(stats.breakdown.active)"
          :sublabel="isAdmin ? 'Across the office' : 'Assigned to you'"
          accent="bg-amber-50 text-amber-600"
          icon="M13 10V3L4 14h7v7l9-11h-7z"
        />
        <StatCard
          label="Completed"
          :value="String(stats.breakdown.completed)"
          :sublabel="`Total volume ${formatCurrency(stats.breakdown.completedFeeSum)}`"
          accent="bg-emerald-50 text-emerald-600"
          icon="M5 13l4 4L19 7"
        />
        <StatCard
          :label="isAdmin ? 'Company earnings' : 'Your earnings'"
          :value="formatCurrency(stats.earnings.total)"
          :sublabel="earningsSubtitle"
          accent="bg-sky-50 text-sky-600"
          icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </section>

      <!-- Second row -->
      <section class="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <!-- Stage distribution -->
        <article class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <header class="mb-4 flex items-center justify-between">
            <div>
              <h2 class="text-sm font-semibold text-slate-900">
                Stage distribution
              </h2>
              <p class="text-xs text-slate-500">
                {{
                  isAdmin
                    ? 'How transactions are spread across stages across the office.'
                    : 'Breakdown of transactions assigned to you by stage.'
                }}
              </p>
            </div>
            <NuxtLink
              to="/transactions"
              class="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
            >
              View all →
            </NuxtLink>
          </header>

          <div
            v-if="stats.breakdown.total === 0"
            class="rounded-md border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500"
          >
            No transactions yet. Create one to get started.
          </div>
          <StageDistributionBar
            v-else
            :by-stage="stats.breakdown.byStage"
            :total="stats.breakdown.total"
          />
        </article>

        <!-- Earnings card (this month) -->
        <article
          class="rounded-xl border border-slate-200 p-5 shadow-sm"
          :class="
            isAdmin
              ? 'bg-gradient-to-br from-indigo-600 to-indigo-700 text-white'
              : 'bg-gradient-to-br from-emerald-600 to-emerald-700 text-white'
          "
        >
          <p class="text-xs font-medium uppercase tracking-wide text-white/70">
            {{ monthLabel }}
          </p>
          <p class="mt-2 text-xs text-white/80">
            {{ isAdmin ? 'Company earnings this month' : 'Your earnings this month' }}
          </p>
          <p class="mt-1 text-3xl font-bold">
            {{ formatCurrency(stats.earnings.thisMonth) }}
          </p>
          <div class="mt-4 h-px bg-white/20" />
          <p class="mt-3 text-xs text-white/80">
            All time
          </p>
          <p class="mt-1 text-lg font-semibold">
            {{ formatCurrency(stats.earnings.total) }}
          </p>
        </article>
      </section>

      <!-- Third row: role-specific main content -->
      <section class="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <!-- Active assignments (agent focus) / recent activity -->
        <article
          class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          :class="isAdmin ? 'lg:col-span-2' : 'lg:col-span-3'"
        >
          <header class="mb-4 flex items-center justify-between">
            <div>
              <h2 class="text-sm font-semibold text-slate-900">
                {{ isAdmin ? 'Recent transactions' : 'Needs your attention' }}
              </h2>
              <p class="text-xs text-slate-500">
                {{
                  isAdmin
                    ? 'The 5 most recently created transactions.'
                    : 'Transactions you own that are not yet completed.'
                }}
              </p>
            </div>
          </header>

          <!-- Agent view: active assignments with quick action -->
          <div v-if="!isAdmin">
            <div
              v-if="activeAssignments.length === 0"
              class="rounded-md border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500"
            >
              All caught up — no active transactions right now.
            </div>
            <ul v-else class="divide-y divide-slate-100">
              <li
                v-for="transaction in activeAssignments"
                :key="transaction._id"
                class="flex items-center gap-3 py-3"
              >
                <div class="min-w-0 flex-1">
                  <NuxtLink
                    :to="`/transactions/${transaction._id}`"
                    class="block truncate text-sm font-semibold text-slate-900 hover:text-indigo-600"
                  >
                    {{ transaction.title }}
                  </NuxtLink>
                  <div class="mt-1 flex items-center gap-2 text-xs text-slate-500">
                    <span
                      class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset"
                      :class="STAGE_BADGE_CLASS[transaction.stage]"
                    >
                      {{ STAGE_LABELS[transaction.stage] }}
                    </span>
                    <span>{{ formatShortDate(transaction.createdAt) }}</span>
                  </div>
                </div>
                <p class="whitespace-nowrap text-sm font-semibold text-emerald-600">
                  {{ formatCurrency(transaction.totalFee) }}
                </p>
                <button
                  type="button"
                  class="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-700"
                  @click="requestStageAdvance(transaction)"
                >
                  Advance
                </button>
              </li>
            </ul>
          </div>

          <!-- Admin view: full recent table snapshot -->
          <div v-else>
            <div
              v-if="stats.recent.length === 0"
              class="rounded-md border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500"
            >
              No transactions have been recorded yet.
            </div>
            <ul v-else class="divide-y divide-slate-100">
              <li
                v-for="transaction in stats.recent"
                :key="transaction._id"
                class="flex items-center gap-3 py-3"
              >
                <div class="min-w-0 flex-1">
                  <NuxtLink
                    :to="`/transactions/${transaction._id}`"
                    class="block truncate text-sm font-semibold text-slate-900 hover:text-indigo-600"
                  >
                    {{ transaction.title }}
                  </NuxtLink>
                  <p class="mt-0.5 truncate text-xs text-slate-500">
                    {{ transaction.listingAgent.name }} ↔ {{ transaction.sellingAgent.name }}
                  </p>
                </div>
                <span
                  class="hidden shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset sm:inline-flex"
                  :class="STAGE_BADGE_CLASS[transaction.stage]"
                >
                  {{ STAGE_LABELS[transaction.stage] }}
                </span>
                <p class="whitespace-nowrap text-sm font-semibold text-emerald-600">
                  {{ formatCurrency(transaction.totalFee) }}
                </p>
              </li>
            </ul>
          </div>
        </article>

        <!-- Top performers (admin only) -->
        <article
          v-if="isAdmin"
          class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <header class="mb-4">
            <h2 class="text-sm font-semibold text-slate-900">
              Top earning agents
            </h2>
            <p class="text-xs text-slate-500">
              Ranked by total earnings from completed transactions.
            </p>
          </header>

          <div
            v-if="stats.topAgents.length === 0"
            class="rounded-md border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500"
          >
            No completed transactions yet.
          </div>
          <ol v-else class="space-y-3">
            <li
              v-for="(agent, index) in stats.topAgents"
              :key="agent.agentId"
              class="flex items-center gap-3"
            >
              <div
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                :class="
                  index === 0
                    ? 'bg-amber-100 text-amber-700'
                    : index === 1
                      ? 'bg-slate-200 text-slate-700'
                      : index === 2
                        ? 'bg-orange-100 text-orange-700'
                        : 'bg-slate-100 text-slate-500'
                "
              >
                {{ index + 1 }}
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-semibold text-slate-900">
                  {{ agent.name }}
                </p>
                <p class="text-xs text-slate-500">
                  {{ agent.completedCount }} completed transaction{{ agent.completedCount === 1 ? '' : 's' }}
                </p>
              </div>
              <p class="whitespace-nowrap text-sm font-semibold text-emerald-600">
                {{ formatCurrency(agent.totalCut) }}
              </p>
            </li>
          </ol>
        </article>
      </section>
    </template>

    <StageTransitionDialog
      v-model="stageDialogOpen"
      :transaction="pendingTransaction"
      :next-stage="pendingNextStage"
      :loading="stageDialogLoading"
      @confirm="confirmStageAdvance"
    />
  </div>
</template>
