import init from './dist/html_rewriter';

import wasm from './dist/html_rewriter_bg.wasm';
import { HTMLRewriterWrapper } from './dist/html_rewriter_wrapper';

export const HTMLRewriter = HTMLRewriterWrapper(init(wasm));
