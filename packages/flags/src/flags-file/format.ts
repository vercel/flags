/**
 * The formatter of flags files, for editors and for `flags format`:
 *
 * ```
 * source self
 *
 * flag summerSale {
 *   key: "summer-sale"
 *   defaultValue: false
 * }
 * ```
 *
 * - Two spaces of indentation, and one entry on each line of a body, with
 *   no commas. A value which was on one line stays on one line, e.g.
 *   `{ value: "a", label: "A" }`, while it fits into 80 columns and has no
 *   comments. A new line after `{` or `[` keeps it on many lines.
 * - Strings in double quotes, unless the string has more double quotes
 *   than single quotes. Keys without quotes, if they are simple names.
 * - A blank line between two statements if one of them has more than one
 *   line, or after `source`. Other blank lines stay, at most one.
 * - The comments stay. A comment between the parts of an entry or a
 *   statement moves to its own line before it.
 *
 * Only a file without syntax errors can be formatted: a file with an error
 * throws a `FlagsFileError`.
 */
import { FlagsFileError } from './compile';
import { DiagnosticCode } from './document';
import { FlagsSyntaxError, parseFlagsSyntax } from './syntax';

const WIDTH = 80;
const INDENT = '  ';
const SIMPLE_KEY = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const NUMBER =
  /^[-+]?(?:0[xX][0-9A-Fa-f]+|(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?)/;
const WORD =
  /^[\p{ID_Start}$_][\p{ID_Continue}$‌‍]*(?:-[\p{ID_Start}$_][\p{ID_Continue}$‌‍]*)*/u;

type TokenKind = 'word' | 'string' | 'number' | 'punct' | 'comment';

interface Token {
  readonly kind: TokenKind;
  readonly text: string;
  /** The number of new lines between the token and the token before it */
  readonly newlines: number;
}

interface Comment {
  readonly text: string;
  readonly line: boolean;
  /** A blank line before the comment */
  readonly blankBefore: boolean;
}

type Node = { readonly kind: 'atom'; readonly text: string } | Container;

interface Container {
  readonly kind: 'object' | 'array';
  readonly items: Item[];
  /** The comments on the line of `{` or `[` */
  readonly openComments: Comment[];
  /** The comments after the last item */
  readonly dangling: Comment[];
  /** A new line after `{` or `[` in the file */
  readonly multiline: boolean;
}

interface Item {
  readonly leading: Comment[];
  readonly blankBefore: boolean;
  readonly key?: string;
  readonly value: Node;
  readonly trailing: Comment[];
}

type Statement =
  | { readonly kind: 'source'; readonly name: string }
  | { readonly kind: 'flag'; readonly name: string; readonly body?: Container };

interface TopItem {
  readonly leading: Comment[];
  readonly blankBefore: boolean;
  readonly statement: Statement;
  readonly trailing: Comment[];
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  let newlines = 0;
  const push = (kind: TokenKind, end: number) => {
    tokens.push({ kind, text: text.slice(index, end), newlines });
    newlines = 0;
    index = end;
  };
  while (index < text.length) {
    const char = text.charAt(index);
    if (/\s/.test(char)) {
      if (char === '\n') {
        newlines++;
      }
      index++;
    } else if (text.startsWith('//', index)) {
      const end = text.indexOf('\n', index);
      push('comment', end === -1 ? text.length : end);
    } else if (text.startsWith('/*', index)) {
      push('comment', text.indexOf('*/', index + 2) + 2);
    } else if (char === '"' || char === "'") {
      let end = index + 1;
      while (end < text.length && text.charAt(end) !== char) {
        end += text.charAt(end) === '\\' ? 2 : 1;
      }
      push('string', end + 1);
    } else if ('{}[]:,'.includes(char)) {
      push('punct', index + 1);
    } else {
      const rest = text.slice(index);
      const match = NUMBER.exec(rest) ?? WORD.exec(rest);
      // The syntax is valid, so each other token is a number or a word
      push(
        /[-+.0-9]/.test(char) ? 'number' : 'word',
        index + (match?.[0].length ?? 1),
      );
    }
  }
  return tokens;
}

/**
 * A string in the preferred quotes: double quotes, unless the string has
 * more double quotes than single quotes. The other escapes stay.
 */
function normalizeString(raw: string): string {
  const content = raw.slice(1, -1);
  const doubles = content.split('"').length - 1;
  const singles = content.split("'").length - 1;
  const quote = doubles > singles ? "'" : '"';
  let result = '';
  for (let index = 0; index < content.length; index++) {
    const char = content.charAt(index);
    if (char === '\\') {
      const next = content.charAt(index + 1);
      index++;
      if (next === '"' || next === "'") {
        result += next === quote ? `\\${next}` : next;
      } else {
        result += `\\${next}`;
      }
    } else if (char === quote) {
      result += `\\${char}`;
    } else {
      result += char;
    }
  }
  return `${quote}${result}${quote}`;
}

function normalizeKey(raw: string): string {
  if (raw.startsWith('"') || raw.startsWith("'")) {
    const content = raw.slice(1, -1);
    if (SIMPLE_KEY.test(content)) {
      return content;
    }
    return normalizeString(raw);
  }
  return raw;
}

class TreeBuilder {
  readonly #tokens: Token[];
  #index = 0;

  constructor(tokens: Token[]) {
    this.#tokens = tokens;
  }

  #peek(): Token | undefined {
    return this.#tokens[this.#index];
  }

  #next(): Token {
    const token = this.#tokens[this.#index++];
    if (!token) {
      throw new Error('flags: The formatter expected more of the file.');
    }
    return token;
  }

  #isPunct(text: string): boolean {
    const token = this.#peek();
    return token?.kind === 'punct' && token.text === text;
  }

  #comment(token: Token): Comment {
    return {
      text: token.text.replace(/\s+$/, ''),
      line: token.text.startsWith('//'),
      blankBefore: token.newlines >= 2,
    };
  }

  /** All comments from here */
  #comments(): Comment[] {
    const comments: Comment[] = [];
    while (this.#peek()?.kind === 'comment') {
      comments.push(this.#comment(this.#next()));
    }
    return comments;
  }

  /** The comments on the same line from here */
  #sameLineComments(): Comment[] {
    const comments: Comment[] = [];
    for (;;) {
      const token = this.#peek();
      if (token?.kind !== 'comment' || token.newlines > 0) {
        return comments;
      }
      comments.push(this.#comment(this.#next()));
    }
  }

  /**
   * Whether a new line or `close` comes after the comments on the same line
   * from here
   */
  #sameLineCommentsEndLine(close: string): boolean {
    let index = this.#index;
    while (
      this.#tokens[index]?.kind === 'comment' &&
      this.#tokens[index]?.newlines === 0
    ) {
      index++;
    }
    const token = this.#tokens[index];
    return (
      !token ||
      token.newlines > 0 ||
      (token.kind === 'punct' && token.text === close)
    );
  }

  /** Whether the next token after the comments is `text` */
  #isPunctAfterComments(text: string): boolean {
    let index = this.#index;
    while (this.#tokens[index]?.kind === 'comment') {
      index++;
    }
    const token = this.#tokens[index];
    return token?.kind === 'punct' && token.text === text;
  }

  file(): { items: TopItem[]; dangling: Comment[] } {
    const items: TopItem[] = [];
    for (;;) {
      const leading = this.#comments();
      const token = this.#peek();
      if (!token) {
        return { items, dangling: leading };
      }
      const blankBefore = token.newlines >= 2;
      const keyword = this.#next().text;
      leading.push(...this.#comments());
      const name = this.#next();
      let statement: Statement;
      if (keyword === 'source') {
        statement = {
          kind: 'source',
          name: name.kind === 'string' ? normalizeString(name.text) : name.text,
        };
      } else if (this.#isPunctAfterComments('{')) {
        leading.push(...this.#comments());
        this.#next();
        statement = {
          kind: 'flag',
          name: name.text,
          body: this.#container('object'),
        };
      } else {
        statement = { kind: 'flag', name: name.text };
      }
      items.push({
        leading,
        blankBefore,
        statement,
        trailing: this.#sameLineComments(),
      });
    }
  }

  /** After `{` or `[` */
  #container(kind: 'object' | 'array'): Container {
    const close = kind === 'object' ? '}' : ']';
    const multiline = (this.#peek()?.newlines ?? 0) > 0;
    const openComments = this.#sameLineComments();
    const items: Item[] = [];
    let carry: Comment[] = [];
    for (;;) {
      const leading = [...carry, ...this.#comments()];
      carry = [];
      if (this.#isPunct(close)) {
        this.#next();
        return { kind, items, openComments, dangling: leading, multiline };
      }
      const blankBefore = (this.#peek()?.newlines ?? 0) >= 2;
      let key: string | undefined;
      if (kind === 'object') {
        key = normalizeKey(this.#next().text);
        leading.push(...this.#comments());
        this.#next(); // :
        leading.push(...this.#comments());
      }
      const value = this.#value();
      const trailing = this.#sameLineComments();
      if (this.#isPunctAfterComments(',')) {
        // Comments on the lines before the comma go to the next item
        carry = this.#comments();
        this.#next();
        // A comment after the comma goes to the item before it if it ends
        // the line, e.g. `1, // one`, else to the next, e.g. `1, /* two */ 2`
        if (carry.length === 0 && this.#sameLineCommentsEndLine(close)) {
          trailing.push(...this.#sameLineComments());
        }
      }
      items.push({ leading, blankBefore, key, value, trailing });
    }
  }

  #value(): Node {
    const token = this.#next();
    if (token.kind === 'punct' && token.text === '{') {
      return this.#container('object');
    }
    if (token.kind === 'punct' && token.text === '[') {
      return this.#container('array');
    }
    if (token.kind === 'string') {
      return { kind: 'atom', text: normalizeString(token.text) };
    }
    return { kind: 'atom', text: token.text };
  }
}

function hasComments(container: Container): boolean {
  return (
    container.openComments.length > 0 ||
    container.dangling.length > 0 ||
    container.items.some(
      (item) => item.leading.length > 0 || item.trailing.length > 0,
    )
  );
}

/** The container on one line, or `undefined` if it needs many lines */
function inline(node: Node): string | undefined {
  if (node.kind === 'atom') {
    return node.text;
  }
  if (node.multiline || hasComments(node)) {
    return undefined;
  }
  const parts: string[] = [];
  for (const item of node.items) {
    const value = inline(item.value);
    if (value === undefined) {
      return undefined;
    }
    parts.push(item.key === undefined ? value : `${item.key}: ${value}`);
  }
  if (node.kind === 'array') {
    return `[${parts.join(', ')}]`;
  }
  if (parts.length === 0) {
    return '{}';
  }
  return `{ ${parts.join(', ')} }`;
}

function printComment(comment: Comment, indent: string): string {
  const lines = comment.text.split(/\r?\n/);
  // A JSDoc comment gets the indentation of its place
  if (lines.length > 1 && lines.slice(1).every((line) => /^\s*\*/.test(line))) {
    return [
      lines[0],
      ...lines.slice(1).map((line) => `${indent} ${line.trim()}`),
    ].join('\n');
  }
  return comment.text;
}

function printTrailing(comments: readonly Comment[], indent: string): string {
  return comments
    .map((comment) => ` ${printComment(comment, indent)}`)
    .join('');
}

/**
 * Prints a value at the column `column` of a line with the indentation
 * `indent`.
 */
function printValue(node: Node, indent: string, column: number): string {
  const oneLine = inline(node);
  if (oneLine !== undefined && column + oneLine.length <= WIDTH) {
    return oneLine;
  }
  if (node.kind === 'atom') {
    return node.text;
  }
  const [open, close] = node.kind === 'object' ? ['{', '}'] : ['[', ']'];
  if (!hasComments(node) && node.items.length === 0) {
    return `${open}${close}`;
  }
  const inner = `${indent}${INDENT}`;
  const lines: string[] = [`${open}${printTrailing(node.openComments, inner)}`];
  const pushComments = (comments: readonly Comment[]) => {
    for (const comment of comments) {
      if (comment.blankBefore && lines.length > 1) {
        lines.push('');
      }
      lines.push(`${inner}${printComment(comment, inner)}`);
    }
  };
  for (const item of node.items) {
    const blank = item.leading[0]?.blankBefore ?? item.blankBefore;
    if (blank && lines.length > 1) {
      lines.push('');
    }
    pushComments(
      item.leading.map((comment, index) =>
        index === 0 ? { ...comment, blankBefore: false } : comment,
      ),
    );
    if (item.leading.length > 0 && item.blankBefore) {
      lines.push('');
    }
    const prefix = item.key === undefined ? '' : `${item.key}: `;
    const value = printValue(item.value, inner, inner.length + prefix.length);
    lines.push(
      `${inner}${prefix}${value}${printTrailing(item.trailing, inner)}`,
    );
  }
  pushComments(node.dangling);
  lines.push(`${indent}${close}`);
  return lines.join('\n');
}

function printStatement(statement: Statement): string {
  if (statement.kind === 'source') {
    return `source ${statement.name}`;
  }
  const head = `flag ${statement.name}`;
  if (!statement.body) {
    return head;
  }
  return `${head} ${printValue(statement.body, '', head.length + 1)}`;
}

/**
 * Formats a flags file. Throws a `FlagsFileError` if the file has a syntax
 * error.
 */
export function formatFlagsFile(
  text: string,
  options: { readonly fileName?: string } = {},
): string {
  const bom = text.charCodeAt(0) === 0xfeff ? '﻿' : '';
  try {
    parseFlagsSyntax(text);
  } catch (error) {
    if (error instanceof FlagsSyntaxError) {
      const diagnostic = {
        severity: 'error' as const,
        message: error.message,
        start: error.start,
        length: error.length,
        code: DiagnosticCode.Syntax,
      };
      throw new FlagsFileError(
        `flags: ${options.fileName ?? 'The flags file'} has a syntax error, so it can not be formatted: ${error.message}`,
        [diagnostic],
      );
    }
    throw error;
  }
  const { items, dangling } = new TreeBuilder(
    tokenize(text.slice(bom.length)),
  ).file();
  const lines: string[] = [];
  let previous: { statement: Statement; printed: string } | undefined;
  for (const item of items) {
    const printed = printStatement(item.statement);
    const first = item.leading[0];
    const forced =
      previous !== undefined &&
      (previous.statement.kind === 'source' ||
        previous.printed.includes('\n') ||
        printed.includes('\n'));
    if (
      lines.length > 0 &&
      (forced || (first?.blankBefore ?? item.blankBefore))
    ) {
      lines.push('');
    }
    item.leading.forEach((comment, index) => {
      if (index > 0 && comment.blankBefore) {
        lines.push('');
      }
      lines.push(printComment(comment, ''));
    });
    if (item.leading.length > 0 && item.blankBefore) {
      lines.push('');
    }
    lines.push(`${printed}${printTrailing(item.trailing, '')}`);
    previous = { statement: item.statement, printed };
  }
  for (const comment of dangling) {
    if (comment.blankBefore && lines.length > 0) {
      lines.push('');
    }
    lines.push(printComment(comment, ''));
  }
  if (lines.length === 0) {
    return bom;
  }
  return `${bom}${lines.join('\n')}\n`;
}
