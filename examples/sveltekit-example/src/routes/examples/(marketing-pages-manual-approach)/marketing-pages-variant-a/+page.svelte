<div class="rounded-md bg-green-100 dark:bg-green-800">
	<div class="p-4 text-sm font-medium text-green-800 dark:text-green-100">
		The feature flag <span class="font-semibold">marketingABTestManualApproach</span> evaluated to
		<span class="font-semibold">true</span>.
	</div>
</div>

<div class="flex gap-2 pt-2">
	<button
		class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-950 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 dark:focus-visible:ring-neutral-300 border border-neutral-200 bg-white shadow-sm hover:bg-neutral-100 hover:text-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:bg-neutral-800 dark:hover:text-neutral-50 h-9 px-4 py-2"
		onclick={() => {
			document.cookie = 'marketingManual=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT';
			window.location.reload();
		}}
	>
		Reset cookie
	</button>
</div>
