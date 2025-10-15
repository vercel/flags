<script lang="ts">
/** biome-ignore-all lint/correctness/noUnusedVariables: used in html */
import type { PageProps } from './$types';

const { data }: PageProps = $props();
</script>

<h1>{data.flag}</h1>
