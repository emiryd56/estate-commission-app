// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: ['@pinia/nuxt', '@nuxtjs/tailwindcss'],

  css: ['~/assets/css/tailwind.css'],

  tailwindcss: {
    cssPath: '~/assets/css/tailwind.css',
    configPath: 'tailwind.config.js',
    exposeConfig: false,
    viewer: true,
  },

  pinia: {
    storesDirs: ['./stores/**'],
  },

  runtimeConfig: {
    public: {
      // Nuxt auto-overrides this with NUXT_PUBLIC_API_BASE at runtime if set
      apiBase: 'http://localhost:3001',
    },
  },
})
