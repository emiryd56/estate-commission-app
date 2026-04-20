<script setup lang="ts">
import { reactive, ref } from 'vue'
import type { LoginPayload } from '~/types'

definePageMeta({ layout: false })

const authStore = useAuthStore()
const router = useRouter()

const form = reactive<LoginPayload>({
  email: '',
  password: '',
})

const isSubmitting = ref(false)

async function handleSubmit(): Promise<void> {
  if (isSubmitting.value) {
    return
  }
  isSubmitting.value = true
  try {
    await authStore.login({ ...form })
    await router.push('/')
  } catch {
    // authStore.error already has the message
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-slate-50 px-4">
    <div class="w-full max-w-md">
      <div class="mb-8 text-center">
        <h1 class="text-2xl font-bold text-slate-900">Emlak Komisyon</h1>
        <p class="mt-1 text-sm text-slate-500">İşlem yönetim paneline giriş</p>
      </div>

      <form
        class="space-y-5 rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
        @submit.prevent="handleSubmit"
      >
        <div>
          <label for="email" class="mb-1 block text-xs font-medium text-slate-700">
            E-posta
          </label>
          <input
            id="email"
            v-model="form.email"
            type="email"
            required
            autocomplete="email"
            class="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            placeholder="ornek@firma.com"
          >
        </div>

        <div>
          <label for="password" class="mb-1 block text-xs font-medium text-slate-700">
            Şifre
          </label>
          <input
            id="password"
            v-model="form.password"
            type="password"
            required
            minlength="6"
            autocomplete="current-password"
            class="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          >
        </div>

        <div
          v-if="authStore.error"
          class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
        >
          {{ authStore.error }}
        </div>

        <button
          type="submit"
          :disabled="isSubmitting"
          class="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:bg-indigo-400"
        >
          {{ isSubmitting ? 'Giriş yapılıyor...' : 'Giriş Yap' }}
        </button>
      </form>
    </div>
  </div>
</template>
