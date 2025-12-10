export const FLAG_LIST_ID = '#flags-defined-flags';

export const injectFlagsTemplate = /* js */ `

import { flags } from '${FLAG_LIST_ID}';
export default defineNuxtPlugin(async (nuxtApp) => {
  try {
    const results = await Promise.all(Object.values(flags).map(async (flag) => [flag.key, await flag(nuxtApp.ssrContext?.event)]));
    for (const [_key, value] of results) {
      const key = \`flag:\${_key}\`;
      const state = toRef(key in nuxtApp.static.data ? nuxtApp.static.data : nuxtApp.payload.data, key);
      state.value = value;
    }
  } catch (err) {
    console.error('[flags] Error evaluating flags on server-side', err);
  }
})

`;

export const pluginPrecomputeServerTemplate = (
  hasPrecompute: boolean,
) => /* js */ `

import { defineNuxtPlugin } from '#app';
/**
 * Nuxt plugin that strips hash prefixes from URLs during prerendering.
 * This runs before the router initializes, allowing Vue Router to see the correct path.
 */
export default defineNuxtPlugin({
  name: 'flags:precompute-rewrite',
  order: -50,
  setup(nuxtApp) {
    ${hasPrecompute ? '' : 'return;'}
    if (import.meta.server && import.meta.prerender && nuxtApp.ssrContext) {
      const hash = nuxtApp.ssrContext.event.context?.precomputedFlags?.hash;
      if (hash) {
        nuxtApp.ssrContext.url = nuxtApp.payload.path = nuxtApp.ssrContext.url.replace(\`/\${hash}\`, '');
      }
    }
  },
});
`;

export const serverImplementation = /* js */ `
import { getRouterParams } from 'h3'
import { useEvent } from 'nitropack/runtime'

export function getStore(event) {
  return event.context.flags ||= {
    event,
    secret: process.env.FLAGS_SECRET,
    params: getRouterParams(event),
    usedFlags: {},
    identifiers: new Map(),
  };
}
export function getEvent() {
  try {
    return useEvent()
  } catch {
    throw new Error('If you do not have nitro.experimental.asyncContext enabled, you must pass the event explicitly to flag functions.')
  }
}
export function getState(key) {
  return { value: undefined }
}
`;

export const clientImplementation = /* js */ `
import { toRef, useNuxtApp, useRequestEvent } from "#imports"

export function getEvent() {
  return useRequestEvent()
}

export function getStore() {
  return useNuxtApp().$flagStore
}

export function getState(_key) {
  const nuxtApp = useNuxtApp();
  const key = \`flag:$\{_key}\`;
  return toRef(key in nuxtApp.static.data ? nuxtApp.static.data : nuxtApp.payload.data, key);
}
`;
