import { createHandle } from '@flags-sdk/sveltekit';
import * as flags from '$lib/flags';

export const handle = createHandle({ flags });
