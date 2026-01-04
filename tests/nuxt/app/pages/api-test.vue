<template>
  <div>
    <h1>API Route Test</h1>
    <div data-testid="api-response">{{ apiResponse }}</div>
    <button @click="() => fetchData()" data-testid="fetch-button">Fetch Data</button>
    <NuxtLink to="/">Back to Home</NuxtLink>
  </div>
</template>

<script setup lang="ts">
const { data: apiResponse, refresh: fetchData } = useFetch('/api/flags-test', {
  server: false,
  transform: (data) => JSON.stringify(data),
  default: () => 'Not loaded',
});
</script>
