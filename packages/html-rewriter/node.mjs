import fs from 'node:fs';
import url from 'node:url';
import init from './dist/html_rewriter.js';
import { HTMLRewriterWrapper } from './dist/html_rewriter_wrapper.js';

const target = url.fileURLToPath(
  new url.URL('./dist/html_rewriter_bg.wasm', import.meta.url),
);

const bytes = fs.readFileSync(target);

const wasm = new WebAssembly.Module(bytes);

export const HTMLRewriter = HTMLRewriterWrapper(init(wasm));
