<template>
  <div>
    <h1>Precompute Test</h1>
    <nav>
      <a href="/">Home</a>
    </nav>
    
    <div data-testid="example-flag">Example Flag: {{ exampleValue }}</div>
    <div data-testid="feature-toggle">Feature Toggle: {{ featureToggleValue }}</div>
    <div data-testid="precompute-hash" v-if="hash">Hash: {{ hash }}</div>
  </div>
</template>

<script setup lang="ts">
import { exampleFlag, featureToggleFlag } from '#flags';

const { data: hash } = await useAsyncData('precompute-hash', async () => {
  if (import.meta.server) {
    return useRequestEvent()?.context.precomputedFlags?.hash || null;
  }
  return null;
});

// Evaluate flags normally
const exampleValue = await exampleFlag();
const featureToggleValue = await featureToggleFlag();
</script>
