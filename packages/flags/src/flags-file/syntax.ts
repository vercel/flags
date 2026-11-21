/**
 * The parser of the syntax of flags files:
 *
 * ```
 * // app.flags
 * source self
 *
 * flag newFeature
 *
 * flag summer-sale {
 *   description: "Shows the summer sale banner"
 *   defaultValue: false
 * }
 * ```
 *
 * - `source <name>` names the source of the flags of the file. The name is
 *   written as a key.
 * - `flag <key>` declares a flag, with an optional body. The key is a
 *   JavaScript identifier, which can also have `-` inside, e.g.
 *   `summer-sale`, or a string in quotes.
 * - The body is a JSON5 object: JSON with keys without quotes, strings in
 *   single quotes, trailing commas and comments. A new line can replace
 *   the comma between two entries.
 * - Comments are `//` and `/* … *\/`, everywhere.
 *
 * Only plain values: nothing is evaluated. Positions are offsets in UTF-16
 * code units, as JavaScript strings use.
 */

export interface Span {
  readonly start: number;
  readonly end: number;
}

export interface ObjectEntry {
  readonly key: string;
  readonly keySpan: Span;
  readonly value: Value;
}

export type Value =
  | { readonly kind: 'string'; readonly value: string; readonly span: Span }
  | { readonly kind: 'number'; readonly value: number; readonly span: Span }
  | { readonly kind: 'boolean'; readonly value: boolean; readonly span: Span }
  | { readonly kind: 'null'; readonly span: Span }
  | {
      readonly kind: 'array';
      readonly items: readonly Value[];
      readonly span: Span;
    }
  | {
      readonly kind: 'object';
      readonly entries: readonly ObjectEntry[];
      readonly span: Span;
    };

export type ObjectValue = Extract<Value, { kind: 'object' }>;

/** `source "<name>"` */
export interface SourceStatement {
  readonly kind: 'source';
  readonly keywordSpan: Span;
  readonly name: string;
  readonly nameSpan: Span;
  readonly span: Span;
}

/** `flag <key>` or `flag <key> { … }` */
export interface FlagStatement {
  readonly kind: 'flag';
  readonly keywordSpan: Span;
  readonly key: string;
  readonly keySpan: Span;
  readonly body?: ObjectValue;
  readonly span: Span;
}

export type Statement = SourceStatement | FlagStatement;

export class FlagsSyntaxError extends Error {
  readonly start: number;
  readonly length: number;

  constructor(message: string, start: number, length = 1) {
    super(message);
    this.name = 'FlagsSyntaxError';
    this.start = start;
    this.length = Math.max(length, 1);
  }
}

const ID_START = /[\p{ID_Start}$_]/u;
const ID_CONTINUE = /[\p{ID_Continue}$‌‍]/u;
const DECIMAL =
  /^(?:(?:0|[1-9][0-9]*)(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?/;
const HEX = /^0[xX][0-9A-Fa-f]+/;

const STATEMENTS =
  'A flags file has only `source <name>` and `flag <key> { … }`.';
const PLAIN_VALUES =
  'A flags file has only plain values: strings, numbers, true, false, null, arrays and objects.';

class Parser {
  readonly #text: string;
  #index = 0;

  constructor(text: string) {
    this.#text = text;
    if (text.charCodeAt(0) === 0xfeff) {
      this.#index = 1;
    }
  }

  parse(): Statement[] {
    const statements: Statement[] = [];
    for (;;) {
      this.#skip();
      if (this.#done()) {
        return statements;
      }
      statements.push(this.#statement());
    }
  }

  #done(): boolean {
    return this.#index >= this.#text.length;
  }

  #peek(offset = 0): string {
    return this.#text.charAt(this.#index + offset);
  }

  #startsWith(value: string): boolean {
    return this.#text.startsWith(value, this.#index);
  }

  #error(message: string, start = this.#index, length = 1): never {
    throw new FlagsSyntaxError(message, start, length);
  }

  /** Whitespace and comments */
  #skip(): void {
    for (;;) {
      const char = this.#peek();
      if (char !== '' && /\s/.test(char)) {
        this.#index++;
      } else if (this.#startsWith('//')) {
        while (!this.#done() && this.#peek() !== '\n') {
          this.#index++;
        }
      } else if (this.#startsWith('/*')) {
        const end = this.#text.indexOf('*/', this.#index + 2);
        if (end === -1) {
          this.#error('The comment has no closing */.', this.#index, 2);
        }
        this.#index = end + 2;
      } else if (char === '#') {
        this.#error(
          'A comment starts with // or /*, as in JavaScript.',
          this.#index,
        );
      } else {
        return;
      }
    }
  }

  /**
   * Skips whitespace and comments, and returns whether they had a new line.
   * A new line separates two entries, as a comma does.
   */
  #skipToNextEntry(): boolean {
    const before = this.#index;
    this.#skip();
    return this.#text.slice(before, this.#index).includes('\n');
  }

  #identifier(): { value: string; span: Span } | undefined {
    const start = this.#index;
    const first = this.#text.codePointAt(this.#index);
    if (first === undefined || !ID_START.test(String.fromCodePoint(first))) {
      return undefined;
    }
    this.#index += first > 0xffff ? 2 : 1;
    for (;;) {
      const code = this.#text.codePointAt(this.#index);
      if (code === undefined || !ID_CONTINUE.test(String.fromCodePoint(code))) {
        break;
      }
      this.#index += code > 0xffff ? 2 : 1;
    }
    return {
      value: this.#text.slice(start, this.#index),
      span: { start, end: this.#index },
    };
  }

  /**
   * The name after `flag` or `source` without quotes: a JavaScript
   * identifier, which can also have `-` between its characters, e.g.
   * `summer-sale`. The keys of a body are identifiers without `-`, as in
   * JavaScript.
   */
  #name(): { value: string; span: Span } | undefined {
    const first = this.#identifier();
    if (!first) {
      return undefined;
    }
    while (this.#peek() === '-') {
      const dash = this.#index;
      this.#index++;
      if (!this.#identifier()) {
        this.#error(
          'A name can not end with "-". Put it in quotes for other keys.',
          dash,
        );
      }
    }
    return {
      value: this.#text.slice(first.span.start, this.#index),
      span: { start: first.span.start, end: this.#index },
    };
  }

  #statement(): Statement {
    const start = this.#index;
    const keyword = this.#identifier();
    if (!keyword) {
      this.#error(`Expected "source" or "flag". ${STATEMENTS}`);
    }
    if (keyword.value === 'source') {
      this.#skip();
      const nameStart = this.#index;
      let name: string;
      if (this.#peek() === '"' || this.#peek() === "'") {
        name = this.#string();
      } else {
        const identifier = this.#name();
        if (!identifier) {
          this.#error('Expected the name of the source, e.g. source self.');
        }
        name = identifier.value;
        this.#rejectUnquoted(nameStart, 'source');
      }
      return {
        kind: 'source',
        keywordSpan: keyword.span,
        name,
        nameSpan: { start: nameStart, end: this.#index },
        span: { start, end: this.#index },
      };
    }
    if (keyword.value !== 'flag') {
      this.#error(
        `Unknown statement "${keyword.value}". ${STATEMENTS}`,
        keyword.span.start,
        keyword.span.end - keyword.span.start,
      );
    }
    this.#skip();
    const keyStart = this.#index;
    let key: string;
    if (this.#peek() === '"' || this.#peek() === "'") {
      key = this.#string();
    } else {
      const identifier = this.#name();
      if (!identifier) {
        this.#error(
          'Expected the key of the flag: a name, e.g. flag summer-sale, or a string in quotes.',
        );
      }
      key = identifier.value;
      this.#rejectUnquoted(keyStart, 'flag');
    }
    const keySpan = { start: keyStart, end: this.#index };
    // The body is optional: flag newFeature
    const afterKey = this.#index;
    this.#skip();
    if (this.#peek() === '{') {
      const body = this.#object();
      return {
        kind: 'flag',
        keywordSpan: keyword.span,
        key,
        keySpan,
        body,
        span: { start, end: this.#index },
      };
    }
    this.#index = afterKey;
    return {
      kind: 'flag',
      keywordSpan: keyword.span,
      key,
      keySpan,
      span: { start, end: this.#index },
    };
  }

  /**
   * After a name without quotes: a `.` would continue it, e.g.
   * `flag checkout.v2`. Such a name needs quotes, because it looks like an
   * access to a property.
   */
  #rejectUnquoted(start: number, keyword: 'flag' | 'source'): void {
    const next = this.#peek();
    if (next !== '.') {
      return;
    }
    let end = this.#index;
    while (end < this.#text.length && /[^\s{/]/.test(this.#text.charAt(end))) {
      end++;
    }
    const whole = this.#text.slice(start, end);
    this.#error(
      `A name with "${next}" needs quotes: ${keyword} "${whole}".`,
      start,
      end - start,
    );
  }

  #value(): Value {
    this.#skip();
    const start = this.#index;
    const char = this.#peek();
    if (char === '"' || char === "'") {
      const value = this.#string();
      return { kind: 'string', value, span: { start, end: this.#index } };
    }
    if (char === '{') {
      return this.#object();
    }
    if (char === '[') {
      return this.#array();
    }
    if (char === '`') {
      this.#error(
        `${PLAIN_VALUES} Use a string in "double" or 'single' quotes, not a template literal.`,
      );
    }
    if (/[-+.0-9]/.test(char)) {
      return this.#number();
    }
    const identifier = this.#identifier();
    if (identifier) {
      const span = identifier.span;
      if (identifier.value === 'true' || identifier.value === 'false') {
        return { kind: 'boolean', value: identifier.value === 'true', span };
      }
      if (identifier.value === 'null') {
        return { kind: 'null', span };
      }
      if (identifier.value === 'Infinity' || identifier.value === 'NaN') {
        this.#error(
          `${identifier.value} has no JSON value, so a flags file can not use it.`,
          span.start,
          span.end - span.start,
        );
      }
      if (identifier.value === 'undefined') {
        this.#error(
          `${PLAIN_VALUES} Leave the field out instead of undefined.`,
          span.start,
          span.end - span.start,
        );
      }
      this.#error(
        `${PLAIN_VALUES} Put text in quotes: "${identifier.value}".`,
        span.start,
        span.end - span.start,
      );
    }
    if (this.#done()) {
      this.#error('Expected a value, but the file ends.');
    }
    this.#error(`Expected a value. ${PLAIN_VALUES}`);
  }

  #number(): Value {
    const start = this.#index;
    let sign = 1;
    if (this.#peek() === '-' || this.#peek() === '+') {
      sign = this.#peek() === '-' ? -1 : 1;
      this.#index++;
    }
    const rest = this.#text.slice(this.#index);
    if (/^(?:Infinity|NaN)/.test(rest)) {
      this.#error(
        'Infinity and NaN have no JSON value, so a flags file can not use them.',
        start,
        this.#index - start + 3,
      );
    }
    const match = HEX.exec(rest) ?? DECIMAL.exec(rest);
    if (!match) {
      this.#error(`Expected a number. ${PLAIN_VALUES}`, start);
    }
    this.#index += match[0].length;
    const next = this.#peek();
    if (next !== '' && (ID_CONTINUE.test(next) || next === '.')) {
      this.#error(
        `${PLAIN_VALUES} This is not a number.`,
        start,
        this.#index - start + 1,
      );
    }
    const value = sign * Number(match[0]);
    if (!Number.isFinite(value)) {
      this.#error('The number is too large.', start, this.#index - start);
    }
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
      this.#error(
        'The integer is too large for JavaScript. Use a string.',
        start,
        this.#index - start,
      );
    }
    return { kind: 'number', value, span: { start, end: this.#index } };
  }

  /** A string in single or double quotes, with the escapes of JSON5 */
  #string(): string {
    const start = this.#index;
    const quote = this.#peek();
    this.#index++;
    let value = '';
    for (;;) {
      if (this.#done() || this.#peek() === '\n' || this.#peek() === '\r') {
        this.#error(
          'The string has no closing quote. For a new line in a string, write \\n.',
          start,
          this.#index - start,
        );
      }
      const char = this.#peek();
      if (char === quote) {
        this.#index++;
        return value;
      }
      if (char === '\\') {
        value += this.#escape();
        continue;
      }
      value += char;
      this.#index++;
    }
  }

  #escape(): string {
    const start = this.#index;
    const char = this.#peek(1);
    const simple: Record<string, string> = {
      "'": "'",
      '"': '"',
      '\\': '\\',
      '/': '/',
      b: '\b',
      f: '\f',
      n: '\n',
      r: '\r',
      t: '\t',
      v: '\v',
    };
    const replacement = simple[char];
    if (replacement !== undefined) {
      this.#index += 2;
      return replacement;
    }
    if (char === '0' && !/[0-9]/.test(this.#peek(2))) {
      this.#index += 2;
      return '\0';
    }
    if (char === '\n' || char === '\r' || char === ' ' || char === ' ') {
      // A backslash at the end of a line continues the string
      this.#index += this.#startsWith('\\\r\n') ? 3 : 2;
      return '';
    }
    if (char === 'x' || char === 'u') {
      const size = char === 'x' ? 2 : 4;
      const hex = this.#text.slice(this.#index + 2, this.#index + 2 + size);
      if (!new RegExp(`^[0-9A-Fa-f]{${size}}$`).test(hex)) {
        this.#error(
          `Expected ${size} hexadecimal digits after \\${char}.`,
          start,
          2,
        );
      }
      this.#index += 2 + size;
      return String.fromCharCode(Number.parseInt(hex, 16));
    }
    this.#error(`"\\${char}" is not a valid escape.`, start, 2);
  }

  #array(): Value {
    const start = this.#index;
    this.#index++;
    const items: Value[] = [];
    for (;;) {
      this.#skip();
      if (this.#peek() === ']') {
        this.#index++;
        break;
      }
      if (this.#done()) {
        this.#error('The array has no closing "]".', start);
      }
      items.push(this.#value());
      const newline = this.#skipToNextEntry();
      if (this.#peek() === ',') {
        this.#index++;
        continue;
      }
      if (this.#peek() === ']') {
        this.#index++;
        break;
      }
      if (newline) {
        continue;
      }
      this.#error(
        `Expected ",", a new line or "]" in the array. ${PLAIN_VALUES}`,
      );
    }
    return { kind: 'array', items, span: { start, end: this.#index } };
  }

  #object(): ObjectValue {
    const start = this.#index;
    this.#index++;
    const entries: ObjectEntry[] = [];
    for (;;) {
      this.#skip();
      if (this.#peek() === '}') {
        this.#index++;
        break;
      }
      if (this.#done()) {
        this.#error('The object has no closing "}".', start);
      }
      const keyStart = this.#index;
      let key: string;
      if (this.#peek() === '"' || this.#peek() === "'") {
        key = this.#string();
      } else {
        const identifier = this.#identifier();
        if (!identifier) {
          this.#error(
            'Expected a key: a name, or a string in quotes. Computed keys are not allowed.',
          );
        }
        key = identifier.value;
      }
      const keySpan = { start: keyStart, end: this.#index };
      this.#skip();
      if (this.#peek() !== ':') {
        if (this.#peek() === '=') {
          this.#error(`Use ":" after the key "${key}", as in JavaScript.`);
        }
        this.#error(`Expected ":" after the key "${key}".`);
      }
      this.#index++;
      const value = this.#value();
      entries.push({ key, keySpan, value });
      const newline = this.#skipToNextEntry();
      if (this.#peek() === ',') {
        this.#index++;
        continue;
      }
      if (this.#peek() === '}') {
        this.#index++;
        break;
      }
      if (newline) {
        continue;
      }
      this.#error(
        `Expected ",", a new line or "}" in the object. ${PLAIN_VALUES}`,
      );
    }
    return { kind: 'object', entries, span: { start, end: this.#index } };
  }
}

/**
 * Parses a flags file into its statements. Throws a `FlagsSyntaxError`
 * with the position of the first error.
 */
export function parseFlagsSyntax(text: string): Statement[] {
  return new Parser(text).parse();
}

/**
 * The JSON value of a value. Throws a `FlagsSyntaxError` for a key of an
 * object which is there two times.
 */
export function toJsonValue(value: Value): unknown {
  switch (value.kind) {
    case 'array': {
      return value.items.map(toJsonValue);
    }
    case 'object': {
      const result: Record<string, unknown> = {};
      for (const entry of value.entries) {
        if (Object.hasOwn(result, entry.key)) {
          throw new FlagsSyntaxError(
            `The key "${entry.key}" is in the object two times.`,
            entry.keySpan.start,
            entry.keySpan.end - entry.keySpan.start,
          );
        }
        result[entry.key] = toJsonValue(entry.value);
      }
      return result;
    }
    case 'null': {
      return null;
    }
    default: {
      return value.value;
    }
  }
}
