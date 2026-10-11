<script lang="ts">
// biome-ignore lint/correctness/noUnusedVariables: used in the template
let { data } = $props();
</script>

<pre id="flags">{JSON.stringify({ sale: data.sale, banner: data.banner })}</pre>
