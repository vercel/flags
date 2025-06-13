import init, {
  HTMLRewriter as RawHTMLRewriter,
} from '../dist/html_rewriter.js';

import { DocumentHandlers, ElementHandlers } from './types';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

// console.log(wasm)

class HTMLRewriter {
  static initPromise?: Promise<void>;

  constructor(options: any = {}) {}

  elementHandlers: [selector: string, handlers: ElementHandlers][] = [];
  documentHandlers: DocumentHandlers[] = [];

  on(selector: string, handlers: ElementHandlers): this {
    this.elementHandlers.push([selector, handlers]);
    return this;
  }

  onDocument(handlers: DocumentHandlers): this {
    this.documentHandlers.push(handlers);
    return this;
  }
  transform(response: Response): Response {
    const body = response.body as ReadableStream<Uint8Array> | null;
    // HTMLRewriter doesn't run the end handler if the body is null, so it's
    // pointless to setup the readable stream.
    if (body === null) return new Response(body, response);

    if (response instanceof Response) {
      // Make sure we validate chunks are BufferSources and convert them to
      // Uint8Arrays as required by the Rust glue code.
      response = new Response(response.body, response);
    }

    let rewriter: RawHTMLRewriter;
    const readable = new ReadableStream<Uint8Array>({
      start: async (controller) => {
        // Create a rewriter instance for this transformation that writes its
        // output to the transformed response's stream. Note that each
        // BaseHTMLRewriter can only be used once.
        await HTMLRewriter.initPromise;
        // console.log('creating rewriter')
        rewriter = new RawHTMLRewriter(
          (chunk: any) => {
            // enqueue will throw on empty chunks
            if (chunk.length !== 0) controller.enqueue(chunk);
          },
          { enableEsiTags: false },
        );
        // Add all registered handlers
        for (const [selector, handlers] of this.elementHandlers) {
          rewriter.on(selector, handlers);
        }
        for (const handlers of this.documentHandlers) {
          rewriter.onDocument(handlers);
        }

        // Pipe the response body to the rewriter
        const reader = body.getReader();
        try {
          while (true) {
            // console.log('reading')
            const { done, value } = await reader.read();
            if (done) break;
            rewriter.write(value);
          }

          rewriter.end();
        } catch (error) {
          // rewriter.end()
          controller.error(error);
        } finally {
          rewriter.free();
          reader.releaseLock();
          controller.close();
        }
      },
    });

    // Return a response with the transformed body, copying over headers, etc
    const res = new Response(readable, response);
    // If Content-Length is set, it's probably going to be wrong, since we're
    // rewriting content, so remove it
    res.headers.delete('Content-Length');
    return res;
  }
}

export function HTMLRewriterWrapper(initPromise: Promise<any>) {
  HTMLRewriter.initPromise = initPromise;
  return HTMLRewriter;
}
