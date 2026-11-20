export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  // codeGeneration writes .flags/self.ts from flags/sources/self
  modules: [['@flags-sdk/nuxt', { codeGeneration: true }]],
});
