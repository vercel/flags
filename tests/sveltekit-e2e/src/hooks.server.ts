import { createHandle } from 'flags/sveltekit';
import * as flags from '$lib/flags';

export const handle = createHandle({ flags });
