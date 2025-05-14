// This file is currently disabled as it is renamed to `__+server.ts`.
//
// The `createHandle` function in your `hooks.server.ts` will inject the
// `/.well-known/vercel/flags` endpoint, so this file is not needed.
//
// For more control you can disable the default injection by not passing `flags` to `createHandle({ secret, flags })`.
// You can then enable this file by renaming it to `+server.ts`
//
// This folder needs to be called [x+2e]well-known as folders starting with a
// dot like .well-known cause issues, so the [x+2e] encoding is necessary.
// See https://github.com/sveltejs/kit/discussions/7562#discussioncomment-4206530
import { createFlagsDiscoveryEndpoint, getProviderData } from 'flags/sveltekit';
import { FLAGS_SECRET } from '$env/static/private';
import * as flags from '$lib/flags';

export const GET = createFlagsDiscoveryEndpoint(
	async () => {
		return getProviderData(flags);
	},
	{ secret: FLAGS_SECRET }
);
