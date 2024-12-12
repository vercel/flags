<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;
</script>

<h1>{data.post.title}</h1>
<div>{@html data.post.content}</div>
<br />
<br />
<div>Dashboard Flag Value: {@html data.dashboard}</div>
<div>Host: {@html data.host}</div>
<div>Cookie: {@html data.cookie}</div>
