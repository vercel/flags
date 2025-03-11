<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<p>{data.first}</p>
<p>{data.second}</p>

<div>
	<button
		onclick={() => {
			document.cookie = 'visitorId=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT';
			window.location.reload();
		}}>Reset cookie</button
	>
	<span
		>(will automatically assign a new visitor id, which depending on the value will opt you into the
		new marketing page)</span
	>
</div>

<style>
	div {
		max-width: 30rem;
	}
</style>
