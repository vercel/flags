/**
 * The content mapper of TypeScript 7.1 for flags files. With it, TypeScript
 * reads `import { summerSale } from './app.flags'` without generated files,
 * and the editor goes from an import to the flag in the flags file.
 *
 * ```jsonc
 * // tsconfig.json
 * {
 *   "contentMappers": [{ "package": "flags", "extensions": [".flags"] }]
 * }
 * ```
 *
 * TypeScript starts this process from `typescript.contentMapper` in the
 * `package.json` of `flags`, and talks to it with JSON-RPC over STDIO, with
 * the framing of LSP (`Content-Length` headers). See
 * https://github.com/microsoft/typescript-go/pull/4712.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  findProjectDirectory,
  renderFlagsFileTypes,
  sourceDirectoryCandidates,
} from './flags-file/compile';

type PositionEncoding = 'utf-8' | 'utf-16';

interface RequestMessage {
  readonly jsonrpc: '2.0';
  readonly id?: number | string | null;
  readonly method: string;
  readonly params?: unknown;
}

const SpanMapKind = { Verbatim: 0, Atom: 1, Alias: 2 } as const;
const SpanMapFeature = {
  Hover: 1 << 0,
  Definition: 1 << 3,
  TypeDefinition: 1 << 4,
  References: 1 << 6,
  DocumentHighlights: 1 << 7,
} as const;

// No rename: a new key is a new flag in the flag management system
const FLAG_FEATURES =
  SpanMapFeature.Hover |
  SpanMapFeature.Definition |
  SpanMapFeature.TypeDefinition |
  SpanMapFeature.References |
  SpanMapFeature.DocumentHighlights;

/**
 * Converts offsets in UTF-16 code units to the encoding of the session.
 */
function encoder(text: string, encoding: PositionEncoding) {
  if (encoding === 'utf-16') {
    return (offset: number) => offset;
  }
  return (offset: number) => Buffer.byteLength(text.slice(0, offset), 'utf8');
}

interface Project {
  readonly directory: string;
}

/**
 * The files which change the output of a transform, other than the flags
 * file: the `package.json` (for `@vercel/flags-core`), `flags/config.json`
 * and the files of each source.
 */
function configFilesOf(directory: string): string[] {
  const files = [
    path.join(directory, 'package.json'),
    path.join(directory, 'flags', 'config.json'),
    path.join(directory, 'src', 'flags', 'config.json'),
  ];
  const names = new Set(['self']);
  for (const base of [
    path.join(directory, 'flags', 'sources'),
    path.join(directory, 'src', 'flags', 'sources'),
  ]) {
    try {
      for (const entry of readdirSync(base, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          names.add(entry.name);
        }
      }
    } catch {
      // No folder of sources
    }
  }
  for (const name of [...names].sort()) {
    for (const folder of sourceDirectoryCandidates(directory, name)) {
      for (const part of ['provider', 'context', 'hooks']) {
        for (const extension of ['ts', 'mts', 'tsx', 'js', 'mjs']) {
          files.push(path.join(folder, `${part}.${extension}`));
        }
      }
    }
  }
  return files;
}

/** A fingerprint of the configuration: which files exist, and their content */
function configIdentity(files: readonly string[]): string {
  const hash = createHash('sha256');
  for (const file of files) {
    if (!existsSync(file)) {
      continue;
    }
    hash.update(file);
    if (file.endsWith('.json')) {
      try {
        hash.update(readFileSync(file));
      } catch {
        // A file which can not be read counts as there
      }
    }
  }
  return hash.digest('hex');
}

export class ContentMapper {
  #encoding: PositionEncoding = 'utf-16';
  readonly #projects = new Map<string, Project>();

  handle(method: string, params: Record<string, unknown>): unknown {
    switch (method) {
      case 'initialize': {
        const offered = (params.positionEncodings as PositionEncoding[]) ?? [];
        this.#encoding = offered.includes('utf-16') ? 'utf-16' : 'utf-8';
        return { positionEncoding: this.#encoding, diagnosticSource: 'flags' };
      }
      case 'openProject': {
        const configFileName = String(params.configFileName ?? '');
        const directory = configFileName
          ? findProjectDirectory(configFileName)
          : process.cwd();
        this.#projects.set(String(params.projectHandle), { directory });
        const watchedFiles = configFilesOf(directory);
        return {
          configIdentity: configIdentity(watchedFiles),
          watchedFiles,
        };
      }
      case 'closeProject': {
        this.#projects.delete(String(params.projectHandle));
        return null;
      }
      case 'transform': {
        return this.transform(
          String(params.fileName),
          String(params.content ?? ''),
        );
      }
      default: {
        throw Object.assign(new Error(`Unknown method ${method}`), {
          code: -32601,
        });
      }
    }
  }

  transform(fileName: string, content: string) {
    const types = renderFlagsFileTypes(content, { fileName });
    const virtual = encoder(types.text, this.#encoding);
    const original = encoder(content, this.#encoding);
    const span = (start: number, length: number, encode: typeof virtual) => {
      const from = encode(start);
      return [from, encode(start + length) - from] as const;
    };
    return {
      text: types.text,
      extension: '.ts',
      mappings: types.mappings.map((mapping) => [
        ...span(mapping.generatedStart, mapping.generatedLength, virtual),
        ...span(mapping.originalStart, mapping.originalLength, original),
        SpanMapKind.Alias,
        FLAG_FEATURES,
      ]),
      // A warning would fail tsc, so only the errors
      diagnostics: types.diagnostics
        .filter((diagnostic) => diagnostic.severity === 'error')
        .map((diagnostic) => {
          const [start, length] = span(
            diagnostic.start,
            diagnostic.length,
            original,
          );
          return {
            messageText: diagnostic.message,
            start,
            length,
            code: diagnostic.code,
          };
        }),
    };
  }
}

/**
 * Reads the messages of LSP framing from a stream, and calls `onMessage`
 * for each.
 */
export function createMessageReader(
  onMessage: (message: RequestMessage) => void,
): (chunk: Buffer) => void {
  let buffer = Buffer.alloc(0);
  return (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) {
        return;
      }
      const header = buffer.subarray(0, headerEnd).toString('ascii');
      const match = /content-length:\s*(\d+)/i.exec(header);
      if (!match) {
        // Not a message: skip the header
        buffer = buffer.subarray(headerEnd + 4);
        continue;
      }
      const length = Number(match[1]);
      const start = headerEnd + 4;
      if (buffer.length < start + length) {
        return;
      }
      const body = buffer.subarray(start, start + length).toString('utf8');
      buffer = buffer.subarray(start + length);
      onMessage(JSON.parse(body) as RequestMessage);
    }
  };
}

export function encodeMessage(message: object): Buffer {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  return Buffer.concat([
    Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'ascii'),
    body,
  ]);
}

/**
 * Serves the content mapper on STDIN and STDOUT, until STDIN ends.
 */
export function serve(
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
): void {
  const mapper = new ContentMapper();
  input.on(
    'data',
    createMessageReader((message) => {
      if (message.id === undefined || message.id === null) {
        // A notification, e.g. "exit"
        if (message.method === 'exit') {
          process.exit(0);
        }
        return;
      }
      try {
        const result = mapper.handle(
          message.method,
          (message.params ?? {}) as Record<string, unknown>,
        );
        output.write(encodeMessage({ jsonrpc: '2.0', id: message.id, result }));
      } catch (error) {
        output.write(
          encodeMessage({
            jsonrpc: '2.0',
            id: message.id,
            error: {
              code: (error as { code?: number }).code ?? -32603,
              message: error instanceof Error ? error.message : String(error),
            },
          }),
        );
      }
    }) as (chunk: unknown) => void,
  );
  input.on('end', () => process.exit(0));
}
