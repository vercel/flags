/**
 * OpenFeature provider for default runtimes
 *
 * There is also openfeature.next-js.ts which targets Next.js specifically.
 * If you update this file, please update openfeature.next-js.ts as well.
 *
 * Try keeping this file small. Export through openfeature.make.
 */

import { createClient } from './index.default';
import { make } from './openfeature.make';

export const VercelProvider = make(createClient);
