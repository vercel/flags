<template>
  <div>
    <h1>Headers and Cookies</h1>
    <div data-testid="host-flag">Host: {{ hostValue }}</div>
    <div data-testid="cookie-flag">Cookie: {{ cookieValue }}</div>
    <NuxtLink to="/">Back to Home</NuxtLink>
  </div>
</template>

<script setup lang="ts">
const hostValue = await hostFlag();
const cookieValue = await cookieFlag();
</script>
