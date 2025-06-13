<div align='center'>
    <br/>
    <br/>
    <br/>
    <h3>html-rewriter</h3>
    <p></p>
    <br/>
    <br/>
</div>

Cloudflare `HTMLRewriter` packaged to work with

- Node.js (reading the wasm from file system)
- Next.js (appending `?module` to wasm imports)
- browser (fetching the wasm file at runtime)
- Deno (fetching the wasm file at runtime with file:// protocol)
- Bun & Cloudflare (simply using the global `HTMLRewriter` object)

This is a fork of [htmlrewriter](https://github.com/remorses/htmlrewriter) by [@remorses](https://github.com/remorses/).

## Install

```
npm i html-rewriter
```

## Usage

```ts
import { HTMLRewriter } from 'html-rewriter';

const rewriter = new HTMLRewriter();

rewriter.on('a', {
  element(element) {
    element.setAttribute('href', 'https://www.baidu.com');
  },
});
const res = rewriter.transform(
  new Response('<a href="https://www.google.com">google</a>'),
);
console.log(await res.text());
```

## License

`html-rewriter-wasm` uses [lol-html](https://github.com/cloudflare/lol-html/)
which is BSD 3-Clause licensed:

```
Copyright (C) 2019, Cloudflare, Inc.
All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
this list of conditions and the following disclaimer in the documentation and/or
other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors
may be used to endorse or promote products derived from this software without
specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```
