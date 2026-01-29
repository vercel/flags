<template>
  <div>
    <h1>Basic Flags</h1>
    <div data-testid="example-flag">Example Flag: {{ exampleFlagValue }}</div>
    <div data-testid="feature-toggle">Feature Toggle: {{ featureToggleValue }}</div>
    <NuxtLink to="/">Back to Home</NuxtLink>
  </div>
</template>

<script setup lang="ts">
import { exampleFlag } from '#flags/index';

const exampleFlagValue = await exampleFlag();
const featureToggleValue = await featureToggleFlag();
</script>
