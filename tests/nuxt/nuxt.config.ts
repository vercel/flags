export default defineNuxtConfig({
  modules: ['flags/nuxt'],
  compatibilityDate: 'latest',
  typescript: {
    nodeTsConfig: {
      include: ['../playwright.config.ts'],
    },
  },
  nitro: {
    prerender: {
      routes: ['/precompute'],
    },
  },
});
