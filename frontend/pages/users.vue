<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { UserRole } from '~/types'
import type { CreateUserPayload, User } from '~/types'

const userStore = useUserStore()

const form = reactive<CreateUserPayload>({
  name: '',
  email: '',
  password: '',
  role: UserRole.AGENT,
})

const isSubmitting = ref(false)
const successMessage = ref<string | null>(null)

const hasUsers = computed(() => userStore.users.length > 0)

onMounted(async () => {
  await userStore.fetchUsers()
})

function resetForm(): void {
  form.name = ''
  form.email = ''
  form.password = ''
  form.role = UserRole.AGENT
}

async function handleSubmit(): Promise<void> {
  if (isSubmitting.value) {
    return
  }
  successMessage.value = null
  isSubmitting.value = true
  try {
    await userStore.createUser({ ...form })
    successMessage.value = `${form.name} başarıyla eklendi.`
    resetForm()
  } catch {
    // store.error already contains the message
  } finally {
    isSubmitting.value = false
  }
}

function roleBadgeClass(role: User['role']): string {
  const map: Record<UserRole, string> = {
    [UserRole.ADMIN]: 'bg-purple-100 text-purple-800',
    [UserRole.AGENT]: 'bg-indigo-100 text-indigo-800',
  }
  return map[role]
}

function roleLabel(role: User['role']): string {
  const map: Record<UserRole, string> = {
    [UserRole.ADMIN]: 'Admin',
    [UserRole.AGENT]: 'Danışman',
  }
  return map[role]
}
</script>

<template>
  <div>
    <header class="mb-8">
      <h1 class="text-2xl font-bold text-slate-900">Danışmanlar</h1>
      <p class="mt-1 text-sm text-slate-500">
        Sistemdeki admin ve danışmanları buradan yönetin.
      </p>
    </header>

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <section class="lg:col-span-1">
        <div class="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 class="mb-4 text-base font-semibold text-slate-900">
            Yeni Danışman Ekle
          </h2>

          <form class="space-y-4" @submit.prevent="handleSubmit">
            <div>
              <label for="name" class="mb-1 block text-xs font-medium text-slate-700">
                Ad Soyad
              </label>
              <input
                id="name"
                v-model="form.name"
                type="text"
                required
                minlength="2"
                maxlength="80"
                class="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                placeholder="Ali Yılmaz"
              >
            </div>

            <div>
              <label for="email" class="mb-1 block text-xs font-medium text-slate-700">
                E-posta
              </label>
              <input
                id="email"
                v-model="form.email"
                type="email"
                required
                class="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                placeholder="ali@firma.com"
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
                class="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                placeholder="En az 6 karakter"
              >
            </div>

            <div>
              <label for="role" class="mb-1 block text-xs font-medium text-slate-700">
                Rol
              </label>
              <select
                id="role"
                v-model="form.role"
                class="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              >
                <option :value="UserRole.AGENT">Danışman</option>
                <option :value="UserRole.ADMIN">Admin</option>
              </select>
            </div>

            <div
              v-if="userStore.error"
              class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
            >
              {{ userStore.error }}
            </div>

            <div
              v-if="successMessage"
              class="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800"
            >
              {{ successMessage }}
            </div>

            <button
              type="submit"
              :disabled="isSubmitting"
              class="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:bg-indigo-400"
            >
              {{ isSubmitting ? 'Kaydediliyor...' : 'Kaydet' }}
            </button>
          </form>
        </div>
      </section>

      <section class="lg:col-span-2">
        <div class="rounded-lg border border-slate-200 bg-white shadow-sm">
          <header class="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <h2 class="text-base font-semibold text-slate-900">
              Mevcut Danışmanlar
            </h2>
            <span
              class="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700"
            >
              {{ userStore.users.length }}
            </span>
          </header>

          <div v-if="userStore.loading && !hasUsers" class="p-6 text-sm text-slate-500">
            Yükleniyor...
          </div>

          <div v-else-if="!hasUsers" class="p-6 text-sm text-slate-500">
            Henüz danışman eklenmemiş.
          </div>

          <ul v-else class="divide-y divide-slate-200">
            <li
              v-for="user in userStore.users"
              :key="user._id"
              class="flex items-center justify-between px-6 py-4 transition-colors hover:bg-slate-50"
            >
              <div class="flex items-center gap-3">
                <div
                  class="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700"
                >
                  {{ user.name.charAt(0).toUpperCase() }}
                </div>
                <div>
                  <p class="text-sm font-semibold text-slate-900">
                    {{ user.name }}
                  </p>
                  <p class="text-xs text-slate-500">{{ user.email }}</p>
                </div>
              </div>
              <span
                class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
                :class="roleBadgeClass(user.role)"
              >
                {{ roleLabel(user.role) }}
              </span>
            </li>
          </ul>
        </div>
      </section>
    </div>
  </div>
</template>
