export default defineNuxtConfig({
  modules: ['flags/nuxt'],
  compatibilityDate: 'latest',
  nitro: {
    prerender: {
      routes: ['/precompute'],
    },
  },
});
