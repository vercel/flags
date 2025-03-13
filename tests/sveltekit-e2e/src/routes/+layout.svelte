<script lang="ts">
	import type { LayoutProps } from './$types';
	import { mountVercelToolbar } from '@vercel/toolbar/vite';
	import { onMount } from 'svelte';

	onMount(() => mountVercelToolbar());

	let { data, children }: LayoutProps = $props();
</script>

<header>
	<nav>
		<a href="/">Home</a>
		<a href="/precomputed">Precomputed</a>
	</nav>
</header>

<main>
	{data.title}
	<!-- +page.svelte is rendered in this <slot> -->
	{@render children?.()}
</main>
