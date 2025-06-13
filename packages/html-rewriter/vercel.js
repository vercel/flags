import init from './dist/html_rewriter';

import wasm from './dist/html_rewriter_bg.wasm?module';
import { HTMLRewriterWrapper } from './dist/html_rewriter_wrapper';

// console.log('using vercel wasm')

export const HTMLRewriter = HTMLRewriterWrapper(init(wasm));
