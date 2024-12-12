<script lang="ts">
	import type { LayoutData } from './$types';

	import { mountVercelToolbar } from '@vercel/toolbar/vite';
	import { onMount } from 'svelte';
	onMount(() => mountVercelToolbar());

	export let data: LayoutData;
</script>

<main>
	{data.title}
	<!-- +page.svelte is rendered in this <slot> -->
	<slot />
</main>
