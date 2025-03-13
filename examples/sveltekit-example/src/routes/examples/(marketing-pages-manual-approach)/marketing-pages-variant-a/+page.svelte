<p>Marketing page (manual approach) variant A</p>

<div>
	<button
		onclick={() => {
			document.cookie = 'marketingManual=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT';
			window.location.reload();
		}}>Reset cookie</button
	>
	<span
		>(will automatically assign a new visitor id, which depending on the value will opt you into one
		of two variants)</span
	>
</div>

<style>
	div {
		max-width: 30rem;
	}
</style>
