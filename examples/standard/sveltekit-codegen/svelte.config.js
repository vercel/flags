import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
export default {
  kit: {
    adapter: adapter({ out: 'build' }),
    // The types of the generated modules of flags:<source>
    alias: { 'flags:self': '.flags/self.ts' },
  },
};
