<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import type { CreateTransactionPayload } from '~/types'

const userStore = useUserStore()
const transactionStore = useTransactionStore()
const router = useRouter()

const form = reactive<CreateTransactionPayload>({
  title: '',
  totalFee: 0,
  listingAgent: '',
  sellingAgent: '',
})

const isSubmitting = ref(false)

const agents = computed(() => userStore.agents)

const canSubmit = computed(
  () =>
    form.title.trim().length >= 3 &&
    form.totalFee > 0 &&
    form.listingAgent !== '' &&
    form.sellingAgent !== '',
)

onMounted(async () => {
  await userStore.fetchUsers()
})

async function handleSubmit(): Promise<void> {
  if (!canSubmit.value || isSubmitting.value) {
    return
  }
  isSubmitting.value = true
  try {
    await transactionStore.createTransaction({ ...form })
    await router.push('/')
  } catch {
    // store.error surfaces the message; stay on page so user can retry
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-2xl">
    <header class="mb-6">
      <NuxtLink
        to="/"
        class="mb-3 inline-flex items-center gap-1 text-xs font-medium text-slate-500 transition-colors hover:text-slate-900"
      >
        <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Panoya Dön
      </NuxtLink>
      <h1 class="text-2xl font-bold text-slate-900">Yeni İşlem Oluştur</h1>
      <p class="mt-1 text-sm text-slate-500">
        İlan ve satış danışmanlarını seçerek yeni bir komisyon süreci başlatın.
      </p>
    </header>

    <form
      class="space-y-5 rounded-lg border border-slate-200 bg-white p-8 shadow-sm"
      @submit.prevent="handleSubmit"
    >
      <div>
        <label for="title" class="mb-1 block text-xs font-medium text-slate-700">
          İşlem Başlığı
        </label>
        <input
          id="title"
          v-model="form.title"
          type="text"
          required
          minlength="3"
          maxlength="160"
          class="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          placeholder="Kadıköy Moda 3+1 Daire Satışı"
        >
      </div>

      <div>
        <label for="totalFee" class="mb-1 block text-xs font-medium text-slate-700">
          Toplam Komisyon (TL)
        </label>
        <input
          id="totalFee"
          v-model.number="form.totalFee"
          type="number"
          required
          min="0"
          step="0.01"
          class="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          placeholder="100000"
        >
      </div>

      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label for="listingAgent" class="mb-1 block text-xs font-medium text-slate-700">
            İlan Danışmanı
          </label>
          <select
            id="listingAgent"
            v-model="form.listingAgent"
            required
            class="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          >
            <option value="" disabled>Danışman seçin</option>
            <option v-for="agent in agents" :key="agent._id" :value="agent._id">
              {{ agent.name }}
            </option>
          </select>
        </div>

        <div>
          <label for="sellingAgent" class="mb-1 block text-xs font-medium text-slate-700">
            Satış Danışmanı
          </label>
          <select
            id="sellingAgent"
            v-model="form.sellingAgent"
            required
            class="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          >
            <option value="" disabled>Danışman seçin</option>
            <option v-for="agent in agents" :key="agent._id" :value="agent._id">
              {{ agent.name }}
            </option>
          </select>
        </div>
      </div>

      <div
        v-if="agents.length === 0 && !userStore.loading"
        class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
      >
        Henüz danışman yok. Önce
        <NuxtLink to="/users" class="font-semibold underline">Danışmanlar</NuxtLink>
        sayfasından bir danışman ekleyin.
      </div>

      <div
        v-if="transactionStore.error"
        class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
      >
        {{ transactionStore.error }}
      </div>

      <div class="flex items-center justify-end gap-3 border-t border-slate-200 pt-5">
        <NuxtLink
          to="/"
          class="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          İptal
        </NuxtLink>
        <button
          type="submit"
          :disabled="!canSubmit || isSubmitting"
          class="rounded-md bg-indigo-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:bg-indigo-400"
        >
          {{ isSubmitting ? 'Oluşturuluyor...' : 'İşlemi Oluştur' }}
        </button>
      </div>
    </form>
  </div>
</template>
