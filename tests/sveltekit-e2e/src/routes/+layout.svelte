<script lang="ts">
/** biome-ignore-all lint/correctness/noUnusedVariables: used in html */
import { mountVercelToolbar } from '@vercel/toolbar/vite';
import { onMount } from 'svelte';
import type { LayoutProps } from './$types';

onMount(() => mountVercelToolbar());

const { data, children }: LayoutProps = $props();
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
