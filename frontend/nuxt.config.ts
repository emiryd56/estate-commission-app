// Nuxt config runs in Node via `nuxi`, so we can safely read the env here.
// `@types/node` is not in the frontend package, hence the narrow declaration.
declare const process: { env: Record<string, string | undefined> }
const isProduction = process.env.NODE_ENV === 'production'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: !isProduction },

  modules: ['@pinia/nuxt', '@nuxtjs/tailwindcss'],

  css: ['~/assets/css/tailwind.css'],

  runtimeConfig: {
    public: {
      // Override at runtime with NUXT_PUBLIC_API_BASE
      apiBase: 'http://localhost:3001',
    },
  },
})
