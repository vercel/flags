<script lang="ts">
// biome-ignore lint/correctness/noUnusedVariables: used in the template
let { data } = $props();
</script>

<pre id="config">{JSON.stringify({ checkout: data.checkout, text: data.text })}</pre>
