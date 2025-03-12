<script lang="ts">
	import { mountVercelToolbar } from '@vercel/toolbar/vite';
	import { onMount } from 'svelte';
	import type { LayoutProps } from './$types';
	import { page } from '$app/state';

	onMount(() => mountVercelToolbar());

	let { children }: LayoutProps = $props();
</script>

{#if page.url.pathname !== '/'}
	<header>
		<nav>
			<a href="/">Back to homepage</a>
		</nav>
	</header>
{/if}

<main>
	{@render children()}
</main>
