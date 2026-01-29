import { defineNuxtPlugin, useRoute } from 'nuxt/app';
// @ts-expect-error
import { toolbarEnabled } from '#build/flags/config.mjs';
import type { FlagStore } from '#flags-implementation';
// @ts-expect-error
import { useHead } from '#imports';
import { encryptFlagValues } from '../../../lib/crypto';
import { safeJsonStringify } from '../../../lib/safe-json-stringify';
import { resolveObjectPromises } from '../../../shared';

export default defineNuxtPlugin(async (nuxtApp) => {
  const flagStore: FlagStore = {
    secret: process.env.FLAGS_SECRET!,
    usedFlags: {},
    identifiers: new Map(),
    event: nuxtApp.ssrContext!.event,
    params: useRoute().params || {},
  };

  // we are not directly returning the store as we don't want to expose the types
  // to the end user
  nuxtApp.provide('flagStore', flagStore);

  if (!toolbarEnabled) {
    return;
  }

  // This is for reporting which flags were used when this page was generated,
  // so the value shows up in Vercel Toolbar, without the client ever being
  // aware of this feature flag.
  nuxtApp.hook('app:rendered', async () => {
    const entries = [
      ...Object.entries(flagStore.usedFlags),
      ...Object.entries(
        nuxtApp.ssrContext!.event.context.flags?.usedFlags || {},
      ),
    ];

    if (entries.length === 0) return;

    const encryptedFlagValues = await encryptFlagValues(
      await resolveObjectPromises({
        ...nuxtApp.ssrContext!.event.context.flags?.usedFlags,
        ...flagStore.usedFlags,
      }),
      process.env.FLAGS_SECRET,
    );

    nuxtApp.runWithContext(() =>
      useHead({
        script: [
          () => ({
            tagPosition: 'bodyClose',
            type: 'application/json',
            'data-flag-values': '',
            innerHTML: safeJsonStringify(encryptedFlagValues),
          }),
        ],
      }),
    );
  });
});
