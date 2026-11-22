import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FlagsFileError } from './compile';
import { formatFlagsFile } from './format';
import { parseFlagsSyntax, type Statement, toJsonValue } from './syntax';

/** The meaning of a file: what the formatter must not change */
function meaning(text: string) {
  return parseFlagsSyntax(text).map((statement: Statement) =>
    statement.kind === 'source'
      ? { source: statement.name }
      : {
          // The text between `flag` and the body: the name of the flag
          flag: text
            .slice(
              statement.keywordSpan.end,
              statement.body?.span.start ?? statement.span.end,
            )
            .trim(),
          body: statement.body ? toJsonValue(statement.body) : undefined,
        },
  );
}

function expectFormat(input: string, output: string) {
  const formatted = formatFlagsFile(input);
  expect(formatted).toBe(output);
  // The same meaning, and a second run changes nothing
  expect(meaning(formatted)).toEqual(meaning(input));
  expect(formatFlagsFile(formatted)).toBe(formatted);
}

describe('formatFlagsFile', () => {
  it('formats statements and bodies', () => {
    expectFormat(
      `source   self
flag newFeature
flag summerSale {key:'summer-sale',
description : "Shows the summer sale banner",
  defaultValue:false,}`,
      `source self

flag newFeature

flag summerSale {
  key: "summer-sale"
  description: "Shows the summer sale banner"
  defaultValue: false
}
`,
    );
  });

  it('keeps flags without a body together', () => {
    expectFormat(
      'flag a\nflag b\n\n\n\nflag c\n',
      'flag a\nflag b\n\nflag c\n',
    );
  });

  it('keeps a short value on one line, and expands a long one', () => {
    expectFormat(
      `flag checkout {
  options: ["control",{value:"express",label:"Express checkout"}]
  defaultValue: { theme: "dark", sizes: [1, 2, 3], nested: { a: "a long text", b: "another long text" } }
}
`,
      `flag checkout {
  options: ["control", { value: "express", label: "Express checkout" }]
  defaultValue: {
    theme: "dark"
    sizes: [1, 2, 3]
    nested: { a: "a long text", b: "another long text" }
  }
}
`,
    );
  });

  it('keeps a value on many lines if it had a new line after the bracket', () => {
    expectFormat(
      `flag checkout {
  options: [
    "control", "express"]
}
`,
      `flag checkout {
  options: [
    "control"
    "express"
  ]
}
`,
    );
  });

  it('keeps a short body on one line', () => {
    expectFormat(
      'flag a { defaultValue: true }\nflag b {}\n',
      'flag a { defaultValue: true }\nflag b {}\n',
    );
  });

  it('prefers double quotes, and removes the quotes of simple keys', () => {
    expectFormat(
      `flag a {
  'key': 'it\\'s'
  description: 'say "hi"'
  defaultValue: { "a-b": 'x', "c": "\\u0041\\n" }
}
`,
      `flag a {
  key: "it's"
  description: 'say "hi"'
  defaultValue: { "a-b": "x", c: "\\u0041\\n" }
}
`,
    );
  });

  it('keeps numbers as they are', () => {
    expectFormat(
      'flag a { options: [0x1F, +1, .5, 5., 1e3] }\n',
      'flag a { options: [0x1F, +1, .5, 5., 1e3] }\n',
    );
  });

  it('keeps the comments', () => {
    expectFormat(
      `// The flags of the shop
source self // the default


/**
   * The sale
   */
flag summerSale { // the body
  // The key in the system
  key: "summer-sale", // trailing

  /* before */ defaultValue: false
  options: [
    true, // yes
    false
    // the end of the options
  ]
  // the end of the body
}
// the end of the file
`,
      `// The flags of the shop
source self // the default

/**
 * The sale
 */
flag summerSale { // the body
  // The key in the system
  key: "summer-sale" // trailing

  /* before */
  defaultValue: false
  options: [
    true // yes
    false
    // the end of the options
  ]
  // the end of the body
}
// the end of the file
`,
    );
  });

  it('moves a comment inside an entry before the entry', () => {
    expectFormat(
      'flag a {\n  key /* k */ : // c\n "a"\n}\n',
      'flag a {\n  /* k */\n  // c\n  key: "a"\n}\n',
    );
  });

  it('expands a value with a comment', () => {
    expectFormat(
      'flag a { options: [1, /* two */ 2] }\n',
      'flag a {\n  options: [\n    1\n    /* two */\n    2\n  ]\n}\n',
    );
  });

  it('normalizes the quotes of a source', () => {
    expectFormat("source 'my.source'\n", 'source "my.source"\n');
  });

  it('keeps an empty file empty, and the byte order mark', () => {
    expect(formatFlagsFile('')).toBe('');
    expect(formatFlagsFile('\n\n')).toBe('');
    expect(formatFlagsFile('﻿flag a')).toBe('﻿flag a\n');
  });

  it('formats files with CRLF line endings', () => {
    expectFormat(
      'flag a {\r\n  key: "a"\r\n  defaultValue: true\r\n}\r\n',
      'flag a {\n  key: "a"\n  defaultValue: true\n}\n',
    );
  });

  it('throws a FlagsFileError for a syntax error', () => {
    expect(() =>
      formatFlagsFile('flag a { defaultValue: tru }', {
        fileName: 'app.flags',
      }),
    ).toThrow(FlagsFileError);
    try {
      formatFlagsFile('flag a { defaultValue: tru }', {
        fileName: 'app.flags',
      });
    } catch (error) {
      expect((error as FlagsFileError).diagnostics).toMatchObject([
        { code: 1, start: 23, length: 3 },
      ]);
    }
  });

  it('formats a file which has only semantic errors', () => {
    expectFormat('flag a {unknown:1}', 'flag a { unknown: 1 }\n');
  });

  it('leaves the example flags files as they are', () => {
    for (const file of [
      'examples/standard/next-flags-files/app.flags',
      'examples/standard/next-flags-files/app/marketing.flags',
    ]) {
      const text = readFileSync(
        resolve(__dirname, '../../../..', file),
        'utf8',
      );
      expect(formatFlagsFile(text)).toBe(text);
    }
  });
});
