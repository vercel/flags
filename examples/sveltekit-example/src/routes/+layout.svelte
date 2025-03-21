<script lang="ts">
	import '../app.css';
	import { mountVercelToolbar } from '@vercel/toolbar/vite';
	import { onMount } from 'svelte';
	import type { LayoutProps } from './$types';

	onMount(() => mountVercelToolbar());

	let { children }: LayoutProps = $props();
</script>

<main class="mx-4 my-2">
	{@render children()}
</main>
