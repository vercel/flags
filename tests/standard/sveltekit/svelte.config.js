import adapter from '@sveltejs/adapter-node';

const platform = process.env.TEST_VARIANT === 'platform';

/** @type {import('@sveltejs/kit').Config} */
export default {
  kit: {
    adapter: adapter({ out: platform ? 'build-platform' : 'build' }),
    outDir: platform ? '.svelte-kit-platform' : '.svelte-kit',
  },
};
