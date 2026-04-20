<script setup lang="ts">
import { computed, onMounted } from 'vue'

interface NavLink {
  to: string
  label: string
  icon: string
  adminOnly?: boolean
}

const authStore = useAuthStore()
const router = useRouter()

const allLinks: NavLink[] = [
  { to: '/', label: 'Ana Sayfa', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { to: '/transactions/new', label: 'Yeni İşlem', icon: 'M12 4v16m8-8H4' },
  { to: '/users', label: 'Danışmanlar', icon: 'M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-5.13a4 4 0 11-8 0 4 4 0 018 0zm6 0a4 4 0 11-8 0 4 4 0 018 0z', adminOnly: true },
]

const navLinks = computed(() =>
  allLinks.filter((link) => !link.adminOnly || authStore.isAdmin),
)

const currentUser = computed(() => authStore.user)

onMounted(async () => {
  if (!authStore.user) {
    await authStore.hydrate()
  }
})

async function handleLogout(): Promise<void> {
  authStore.logout()
  await router.push('/login')
}
</script>

<template>
  <div class="flex h-screen">
    <aside class="flex h-screen w-[250px] flex-col bg-slate-900 text-white">
      <div class="border-b border-slate-800 px-6 py-5">
        <h1 class="text-lg font-semibold tracking-tight">Emlak Komisyon</h1>
        <p class="mt-1 text-xs text-slate-400">İşlem Yönetim Paneli</p>
      </div>

      <nav class="flex-1 space-y-1 px-3 py-4">
        <NuxtLink
          v-for="link in navLinks"
          :key="link.to"
          :to="link.to"
          class="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
          active-class="bg-slate-800 text-white"
        >
          <svg
            class="h-5 w-5"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              :d="link.icon"
            />
          </svg>
          {{ link.label }}
        </NuxtLink>
      </nav>

      <div v-if="currentUser" class="border-t border-slate-800 px-4 py-4">
        <div class="mb-3 flex items-center gap-3">
          <div
            class="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-500 text-sm font-semibold"
          >
            {{ currentUser.email.charAt(0).toUpperCase() }}
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-white">
              {{ currentUser.email }}
            </p>
            <p class="text-xs capitalize text-slate-400">
              {{ currentUser.role === 'admin' ? 'Admin' : 'Danışman' }}
            </p>
          </div>
        </div>
        <button
          type="button"
          class="flex w-full items-center justify-center gap-2 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700"
          @click="handleLogout"
        >
          <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Çıkış Yap
        </button>
      </div>
    </aside>

    <main class="flex-1 overflow-y-auto bg-slate-50 p-8">
      <slot />
    </main>
  </div>
</template>
