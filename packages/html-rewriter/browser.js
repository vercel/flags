import init from './dist/html_rewriter';

import { HTMLRewriterWrapper } from './dist/html_rewriter_wrapper';

export const HTMLRewriter = HTMLRewriterWrapper(
  init(fetch(new URL('./dist/html_rewriter_bg.wasm', import.meta.url))),
);
