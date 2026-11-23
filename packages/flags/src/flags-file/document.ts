/**
 * The flags file format, which declares the flags of an application. See
 * "Flags files" in SPEC.md.
 *
 * ```
 * source self
 *
 * flag summerSale {
 *   key: "summer-sale"
 *   description: "Shows the summer sale banner"
 *   defaultValue: false
 * }
 * ```
 */
import type { FlagType } from '../value-types';
import {
  FlagsSyntaxError,
  type ObjectEntry,
  type ObjectValue,
  parseFlagsSyntax,
  type Span,
  type Statement,
  toJsonValue,
  type Value,
} from './syntax';

export type { Span } from './syntax';

/**
 * The extension of flags files.
 */
export const FLAGS_FILE_EXTENSION = '.flags';

/**
 * The source of a flags file without `source`.
 */
export const DEFAULT_SOURCE_NAME = 'self';

export interface FlagsFileDiagnostic {
  readonly severity: 'error' | 'warning';
  readonly message: string;
  readonly start: number;
  readonly length: number;
  /** A stable number for each kind of diagnostic */
  readonly code: number;
}

/**
 * The numbers of the diagnostics. They do not change between versions.
 */
export const DiagnosticCode = {
  Syntax: 1,
  UnknownKey: 2,
  InvalidValue: 3,
  TypeMismatch: 4,
  DuplicateOption: 5,
  /** Two flags with the same key in one source */
  DuplicateKey: 6,
  NotAFlag: 7,
  DefaultNotInOptions: 8,
} as const;

export interface FlagsFileOption {
  readonly value: unknown;
  readonly label?: string;
}

/**
 * One flag of a flags file.
 */
export interface FlagsFileFlag {
  /**
   * The name after `flag`: the name of the export, which the application
   * imports, e.g. `summerSale`.
   */
  readonly name: string;
  readonly nameSpan: Span;
  /**
   * The key of the flag in the flag management system: the field `key`, or
   * else the name.
   */
  readonly key: string;
  /** The value of the field `key`, if the flag has it */
  readonly keySpan?: Span;
  /** The source of the flag: the field `source`, or the source of the file */
  readonly source: string;
  /** The value of the field `source`, if the flag has it */
  readonly sourceSpan?: Span;
  /** The statement of the flag, with its body */
  readonly span: Span;
  readonly type: FlagType;
  readonly description?: string;
  readonly defaultValue?: unknown;
  readonly options?: readonly FlagsFileOption[];
}

export interface FlagsFileDocument {
  /**
   * The default source of the flags of the file: `source`, or `self`. A
   * flag can have another source in its field `source`.
   */
  readonly source: string;
  /** The value of `source`, if the file has it */
  readonly sourceSpan?: Span;
  readonly flags: readonly FlagsFileFlag[];
  readonly diagnostics: readonly FlagsFileDiagnostic[];
}

const FLAG_TYPES: readonly FlagType[] = [
  'boolean',
  'string',
  'number',
  'object',
];
const FLAG_FIELDS = [
  'key',
  'source',
  'description',
  'type',
  'defaultValue',
  'options',
];
const OPTION_FIELDS = ['value', 'label'];
// As for the folders of flags/sources
const SOURCE_NAME = /^[a-z][a-z0-9_-]*$/i;

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
// Words which can not be the name of a binding. An export can have such a
// name, but an import of it needs `as`.
const RESERVED = new Set(
  'break case catch class const continue debugger default delete do else enum export extends false finally for function if import in instanceof new null return super switch this throw true try typeof var void while with yield let static implements interface package private protected public await'.split(
    ' ',
  ),
);

/**
 * Whether a name can be imported without quotes, e.g. `import { name }`.
 */
export function isPlainIdentifier(name: string): boolean {
  return IDENTIFIER.test(name) && !RESERVED.has(name);
}

/** The closest of the words, for "Did you mean …?" */
function closest(
  word: string,
  candidates: readonly string[],
): string | undefined {
  const distance = (a: string, b: string): number => {
    const row = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i++) {
      let previous = row[0] ?? 0;
      row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const current = row[j] ?? 0;
        const cost =
          a[i - 1]?.toLowerCase() === b[j - 1]?.toLowerCase() ? 0 : 1;
        row[j] = Math.min(current + 1, (row[j - 1] ?? 0) + 1, previous + cost);
        previous = current;
      }
    }
    return row[b.length] ?? Number.POSITIVE_INFINITY;
  };
  let best: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const d = distance(word, candidate);
    if (d < bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }
  return bestDistance <= Math.max(2, Math.floor(word.length / 3))
    ? best
    : undefined;
}

function typeOfValue(value: unknown): FlagType {
  if (typeof value === 'boolean') {
    return 'boolean';
  }
  if (typeof value === 'string') {
    return 'string';
  }
  if (typeof value === 'number') {
    return 'number';
  }
  return 'object';
}

function describe(type: FlagType): string {
  if (type === 'object') {
    return 'an object, an array or null';
  }
  return `a ${type}`;
}

class Analyzer {
  readonly diagnostics: FlagsFileDiagnostic[] = [];

  report(
    code: number,
    message: string,
    span: Span,
    severity: 'error' | 'warning' = 'error',
  ): void {
    this.diagnostics.push({
      severity,
      message,
      start: span.start,
      length: Math.max(span.end - span.start, 1),
      code,
    });
  }

  unknown(
    name: string,
    span: Span,
    known: readonly string[],
    what: string,
    where: string,
  ): void {
    const suggestion = closest(name, known);
    this.report(
      DiagnosticCode.UnknownKey,
      `Unknown ${what} "${name}" ${where}.${suggestion ? ` Did you mean "${suggestion}"?` : ` Use ${known.map((field) => `"${field}"`).join(', ')}.`}`,
      span,
    );
  }

  json(value: Value): { ok: true; value: unknown } | { ok: false } {
    try {
      return { ok: true, value: toJsonValue(value) };
    } catch (error) {
      if (error instanceof FlagsSyntaxError) {
        this.report(DiagnosticCode.Syntax, error.message, {
          start: error.start,
          end: error.start + error.length,
        });
        return { ok: false };
      }
      throw error;
    }
  }

  options(
    value: Value,
  ): { option: FlagsFileOption; span: Span; explicit: boolean }[] | undefined {
    if (value.kind !== 'array') {
      this.report(
        DiagnosticCode.InvalidValue,
        '"options" must be an array, e.g. ["control", "express"].',
        value.span,
      );
      return undefined;
    }
    const result: { option: FlagsFileOption; span: Span; explicit: boolean }[] =
      [];
    for (const item of value.items) {
      const isOption =
        item.kind === 'object' &&
        item.entries.some((entry) => entry.key === 'value');
      if (!isOption) {
        const json = this.json(item);
        if (json.ok) {
          result.push({
            option: { value: json.value },
            span: item.span,
            explicit: false,
          });
        }
        continue;
      }
      let optionValue: { ok: true; value: unknown } | { ok: false } = {
        ok: false,
      };
      let label: string | undefined;
      let valid = true;
      for (const entry of item.kind === 'object' ? item.entries : []) {
        if (entry.key === 'value') {
          optionValue = this.json(entry.value);
          valid &&= optionValue.ok;
        } else if (entry.key === 'label') {
          if (entry.value.kind === 'string') {
            label = entry.value.value;
          } else {
            valid = false;
            this.report(
              DiagnosticCode.InvalidValue,
              '"label" must be a string.',
              entry.value.span,
            );
          }
        } else {
          valid = false;
          this.unknown(
            entry.key,
            entry.keySpan,
            OPTION_FIELDS,
            'key',
            'in an option',
          );
        }
      }
      if (valid && optionValue.ok) {
        result.push({
          option: {
            value: optionValue.value,
            ...(label !== undefined ? { label } : {}),
          },
          span: item.span,
          explicit: true,
        });
      }
    }
    return result;
  }

  flag(
    name: string,
    nameSpan: Span,
    defaultSource: string,
    span: Span,
    body: ObjectValue | undefined,
  ): FlagsFileFlag | undefined {
    // The messages name a flag by its name, as the file does
    const key = name;
    const fields = new Map<string, ObjectEntry>();
    let valid = true;
    for (const entry of body?.entries ?? []) {
      if (!FLAG_FIELDS.includes(entry.key)) {
        valid = false;
        this.unknown(
          entry.key,
          entry.keySpan,
          FLAG_FIELDS,
          'field',
          `in the flag "${key}"`,
        );
        continue;
      }
      if (fields.has(entry.key)) {
        valid = false;
        this.report(
          DiagnosticCode.Syntax,
          `The field "${entry.key}" is defined two times.`,
          entry.keySpan,
        );
        continue;
      }
      fields.set(entry.key, entry);
    }

    let systemKey: { value: string; span: Span } | undefined;
    const keyField = fields.get('key');
    if (keyField) {
      if (keyField.value.kind === 'string' && keyField.value.value !== '') {
        systemKey = { value: keyField.value.value, span: keyField.value.span };
      } else {
        valid = false;
        this.report(
          DiagnosticCode.InvalidValue,
          '"key" must be the key of the flag in your flag management system, in quotes, e.g. key: "summer-sale".',
          keyField.value.span,
        );
      }
    }

    let source: { value: string; span: Span } | undefined;
    const sourceField = fields.get('source');
    if (sourceField) {
      if (
        sourceField.value.kind === 'string' &&
        SOURCE_NAME.test(sourceField.value.value)
      ) {
        source = {
          value: sourceField.value.value,
          span: sourceField.value.span,
        };
      } else {
        valid = false;
        this.report(
          DiagnosticCode.InvalidValue,
          '"source" must be the name of a source in quotes, e.g. source: "marketing". It starts with a letter, and has only letters, digits, "-" and "_".',
          sourceField.value.span,
        );
      }
    }

    let description: string | undefined;
    const descriptionField = fields.get('description');
    if (descriptionField) {
      if (descriptionField.value.kind === 'string') {
        description = descriptionField.value.value;
      } else {
        valid = false;
        this.report(
          DiagnosticCode.InvalidValue,
          '"description" must be a string.',
          descriptionField.value.span,
        );
      }
    }

    let declaredType: FlagType | undefined;
    const typeField = fields.get('type');
    if (typeField) {
      const value = typeField.value;
      if (
        value.kind === 'string' &&
        (FLAG_TYPES as readonly string[]).includes(value.value)
      ) {
        declaredType = value.value as FlagType;
      } else {
        valid = false;
        this.report(
          DiagnosticCode.InvalidValue,
          `"type" must be ${FLAG_TYPES.map((type) => `"${type}"`).join(', ')}.`,
          value.span,
        );
      }
    }

    let defaultValue: { value: unknown; span: Span } | undefined;
    const defaultField = fields.get('defaultValue');
    if (defaultField) {
      const json = this.json(defaultField.value);
      if (json.ok) {
        defaultValue = { value: json.value, span: defaultField.value.span };
      } else {
        valid = false;
      }
    }

    const optionsField = fields.get('options');
    const options = optionsField ? this.options(optionsField.value) : undefined;
    if (optionsField && !options) {
      valid = false;
    }

    // The type: as declared, else of the default value, else of the
    // options, else boolean, as for bindFlag
    let type: FlagType = declaredType ?? 'boolean';
    if (!declaredType) {
      if (defaultValue) {
        type = typeOfValue(defaultValue.value);
      } else if (options && options.length > 0) {
        const types = new Set(
          options.map(({ option }) => typeOfValue(option.value)),
        );
        if (types.size > 1 && optionsField) {
          this.report(
            DiagnosticCode.TypeMismatch,
            `The options of "${key}" have different types. Set "type", or use options of one type.`,
            optionsField.value.span,
          );
          return undefined;
        }
        type = [...types][0] ?? 'boolean';
      }
    }

    if (defaultValue && typeOfValue(defaultValue.value) !== type) {
      valid = false;
      this.report(
        DiagnosticCode.TypeMismatch,
        `The flag "${key}" has the type ${type}, so "defaultValue" must be ${describe(type)}.`,
        defaultValue.span,
      );
    }
    const seen = new Set<string>();
    for (const { option, span: optionSpan, explicit } of options ?? []) {
      if (typeOfValue(option.value) !== type) {
        valid = false;
        this.report(
          DiagnosticCode.TypeMismatch,
          `The flag "${key}" has the type ${type}, so each option must be ${describe(type)}.`,
          optionSpan,
        );
        continue;
      }
      if (type === 'object' && !explicit) {
        valid = false;
        this.report(
          DiagnosticCode.InvalidValue,
          'An option of an object flag must be { value: … }, e.g. { value: { color: "red" } }, because a value and an option look the same.',
          optionSpan,
        );
        continue;
      }
      const id = JSON.stringify(option.value);
      if (seen.has(id)) {
        valid = false;
        this.report(
          DiagnosticCode.DuplicateOption,
          `The option ${id} is in "options" two times.`,
          optionSpan,
        );
      }
      seen.add(id);
    }
    if (
      defaultValue &&
      options &&
      options.length > 0 &&
      type !== 'object' &&
      !seen.has(JSON.stringify(defaultValue.value))
    ) {
      this.report(
        DiagnosticCode.DefaultNotInOptions,
        `"defaultValue" is not one of the options of "${key}".`,
        defaultValue.span,
        'warning',
      );
    }

    if (!valid) {
      return undefined;
    }
    return {
      name,
      nameSpan,
      key: systemKey?.value ?? name,
      ...(systemKey ? { keySpan: systemKey.span } : {}),
      source: source?.value ?? defaultSource,
      ...(source ? { sourceSpan: source.span } : {}),
      span,
      type,
      ...(description !== undefined ? { description } : {}),
      ...(defaultValue ? { defaultValue: defaultValue.value } : {}),
      ...(options ? { options: options.map(({ option }) => option) } : {}),
    };
  }
}

/**
 * Reads a flags file. It never throws: an error in the file is a
 * diagnostic with its position. A flag with an error is not in `flags`.
 */
export function parseFlagsFile(text: string): FlagsFileDocument {
  const analyzer = new Analyzer();
  let statements: Statement[];
  try {
    statements = parseFlagsSyntax(text);
  } catch (error) {
    if (error instanceof FlagsSyntaxError) {
      analyzer.report(DiagnosticCode.Syntax, error.message, {
        start: error.start,
        end: error.start + error.length,
      });
      return {
        source: DEFAULT_SOURCE_NAME,
        flags: [],
        diagnostics: analyzer.diagnostics,
      };
    }
    throw error;
  }

  let source = DEFAULT_SOURCE_NAME;
  let sourceSpan: Span | undefined;
  let seenSource = false;
  let seenFlag = false;
  const flags: FlagsFileFlag[] = [];
  const names = new Set<string>();
  // The name of the flag of each source and key
  const keys = new Map<string, string>();
  for (const statement of statements) {
    if (statement.kind === 'source') {
      if (seenSource) {
        analyzer.report(
          DiagnosticCode.Syntax,
          'A flags file has one source.',
          statement.keywordSpan,
        );
        continue;
      }
      seenSource = true;
      if (seenFlag) {
        analyzer.report(
          DiagnosticCode.Syntax,
          'Put source before the first flag.',
          statement.keywordSpan,
        );
      }
      if (SOURCE_NAME.test(statement.name)) {
        source = statement.name;
        sourceSpan = statement.nameSpan;
      } else {
        analyzer.report(
          DiagnosticCode.InvalidValue,
          'The name of a source starts with a letter, and has only letters, digits, "-" and "_", e.g. source "self".',
          statement.nameSpan,
        );
      }
      continue;
    }
    seenFlag = true;
    const name = statement.name;
    if (!isPlainIdentifier(name)) {
      analyzer.report(
        DiagnosticCode.InvalidValue,
        `"${name}" is a reserved word of JavaScript, so it can not be the name of a flag. Choose another name, and set the key: flag ${name}Flag { key: "${name}" }.`,
        statement.nameSpan,
      );
      continue;
    }
    if (names.has(name)) {
      analyzer.report(
        DiagnosticCode.Syntax,
        `The flag ${name} is declared two times.`,
        statement.nameSpan,
      );
      continue;
    }
    names.add(name);
    const flag = analyzer.flag(
      name,
      statement.nameSpan,
      source,
      statement.span,
      statement.body,
    );
    if (!flag) {
      continue;
    }
    // A key can be in a file once for each source
    const id = JSON.stringify([flag.source, flag.key]);
    const other = keys.get(id);
    if (other !== undefined) {
      analyzer.report(
        DiagnosticCode.DuplicateKey,
        `The flags ${other} and ${name} have the same key "${flag.key}" in the source "${flag.source}". Each key can have one flag.`,
        flag.keySpan ?? flag.nameSpan,
      );
      continue;
    }
    keys.set(id, name);
    flags.push(flag);
  }

  return {
    source,
    ...(sourceSpan ? { sourceSpan } : {}),
    flags,
    diagnostics: analyzer.diagnostics,
  };
}

/**
 * The object of the fields of a flag, as `bindFlag` takes them. For the
 * tests and for tools which want plain data.
 *
 * @internal
 */
export function flagOptionsOf(flag: FlagsFileFlag): Record<string, unknown> {
  return {
    key: flag.key,
    source: flag.source,
    type: flag.type,
    ...(flag.options ? { options: flag.options } : {}),
    ...(flag.description !== undefined
      ? { description: flag.description }
      : {}),
    ...(flag.defaultValue !== undefined
      ? { defaultValue: flag.defaultValue }
      : {}),
  };
}
