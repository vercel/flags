<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<h1>{data.title}</h1>

<button
	onclick={() => {
		document.cookie = 'showNewDashboard=true; Path=/';
		window.location.reload();
	}}>Act as flagged in user</button
>
<button
	onclick={() => {
		document.cookie = 'showNewDashboard=false; Path=/';
		window.location.reload();
	}}>Act as a regular user</button
>
<button
	onclick={() => {
		document.cookie = 'showNewDashboard=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT';
		window.location.reload();
	}}>Clear cookie</button
>
