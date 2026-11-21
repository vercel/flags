import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ContentMapper,
  createMessageReader,
  encodeMessage,
} from './content-mapper';

describe('the content mapper of TypeScript 7.1', () => {
  let directory: string;

  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'flags-mapper-'));
    await writeFile(path.join(directory, 'package.json'), '{}');
    await writeFile(path.join(directory, 'tsconfig.json'), '{}');
    await mkdir(path.join(directory, 'flags/sources/self'), {
      recursive: true,
    });
    await writeFile(
      path.join(directory, 'flags/sources/self/provider.ts'),
      'export default {};',
    );
  });

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('reads and writes messages with Content-Length headers', () => {
    const messages: unknown[] = [];
    const read = createMessageReader((message) => messages.push(message));
    const encoded = encodeMessage({ jsonrpc: '2.0', id: 1, method: 'é' });
    // In two chunks, as a pipe can deliver them
    read(encoded.subarray(0, 10));
    read(encoded.subarray(10));
    expect(messages).toEqual([{ jsonrpc: '2.0', id: 1, method: 'é' }]);
  });

  it('maps each export to the key of its flag, also in UTF-8', () => {
    const mapper = new ContentMapper();
    expect(
      mapper.handle('initialize', { positionEncodings: ['utf-8'] }),
    ).toEqual({ positionEncoding: 'utf-8', diagnosticSource: 'flags' });
    const opened = mapper.handle('openProject', {
      configFileName: path.join(directory, 'tsconfig.json'),
      projectHandle: 'p1',
      compilerOptions: {},
    }) as { configIdentity: string; watchedFiles: string[] };
    expect(opened.configIdentity).toMatch(/^[0-9a-f]{64}$/);
    expect(opened.watchedFiles).toContain(
      path.join(directory, 'flags/sources/self/provider.ts'),
    );

    // "é" is two bytes in UTF-8
    const content =
      '// é\nflag "summer-sale" {\n  defaultValue: true,\n}\n\nflag broken {\n  type: "boolean",\n  defaultValue: 1,\n}\n';
    const result = mapper.handle('transform', {
      fileName: path.join(directory, 'app.flags'),
      content,
      projectHandle: 'p1',
    }) as {
      text: string;
      mappings: number[][];
      diagnostics: { start: number; messageText: string }[];
    };
    const bytes = Buffer.from(content);
    const text = Buffer.from(result.text);
    expect(
      result.mappings.map(
        ([virtualStart = 0, virtualLength = 0, start = 0, length = 0]) => [
          text.subarray(virtualStart, virtualStart + virtualLength).toString(),
          bytes.subarray(start, start + length).toString(),
        ],
      ),
    ).toEqual([
      ['flag_0', '"summer-sale"'],
      ['summerSale', '"summer-sale"'],
    ]);
    expect(result.diagnostics).toEqual([
      {
        messageText:
          'The flag "broken" has the type boolean, so "defaultValue" must be a boolean.',
        start: bytes.indexOf('1,\n'),
        length: 1,
        code: 4,
      },
    ]);
  });
});
