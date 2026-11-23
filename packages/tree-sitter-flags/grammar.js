/**
 * @file The Tree-sitter grammar of flags files (*.flags) of the Flags SDK.
 *
 * ```
 * source self
 *
 * flag newFeature
 *
 * flag summerSale {
 *   key: "summer-sale"
 *   description: "Shows the summer sale banner"
 *   defaultValue: false
 * }
 * ```
 *
 * The grammar is for editors: it highlights and folds the file. It accepts
 * a little more than the SDK, e.g. two entries on one line without a comma.
 * The parser of the SDK (`packages/flags/src/flags-file/syntax.ts`) is the
 * reference, and reports each error.
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

/**
 * Items separated by commas or new lines, with an optional comma at the
 * end. A new line is whitespace for Tree-sitter, so the comma is optional.
 *
 * @param {RuleOrLiteral} rule
 */
function list(rule) {
  return optional(seq(rule, repeat(seq(optional(','), rule)), optional(',')));
}

module.exports = grammar({
  name: 'flags',

  extras: ($) => [/\s/, $.comment],

  word: ($) => $.identifier,

  rules: {
    source_file: ($) => repeat(choice($.source_statement, $.flag_statement)),

    source_statement: ($) =>
      seq('source', field('name', choice($.name, $.string))),

    // The name of a flag is the JavaScript name which the code imports. Its
    // key in the flag management system is the field key of the body.
    flag_statement: ($) =>
      seq(
        'flag',
        field('name', $.identifier),
        optional(field('body', $.object)),
      ),

    object: ($) => seq('{', list($.pair), '}'),

    pair: ($) =>
      seq(
        field('key', choice($.identifier, $.string)),
        ':',
        field('value', $._value),
      ),

    array: ($) => seq('[', list($._value), ']'),

    _value: ($) =>
      choice($.object, $.array, $.string, $.number, $.true, $.false, $.null),

    string: ($) =>
      choice(
        seq(
          '"',
          repeat(
            choice(
              alias(token.immediate(prec(1, /[^"\\\n]+/)), $.string_content),
              $.escape_sequence,
            ),
          ),
          '"',
        ),
        seq(
          "'",
          repeat(
            choice(
              alias(token.immediate(prec(1, /[^'\\\n]+/)), $.string_content),
              $.escape_sequence,
            ),
          ),
          "'",
        ),
      ),

    escape_sequence: (_) =>
      token.immediate(
        seq(
          '\\',
          choice(/x[0-9a-fA-F]{2}/, /u[0-9a-fA-F]{4}/, /\r?\n/, /[^xu\r\n]/),
        ),
      ),

    number: (_) =>
      token(
        seq(
          optional(/[-+]/),
          choice(
            /0[xX][0-9a-fA-F]+/,
            /([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][-+]?[0-9]+)?/,
          ),
        ),
      ),

    true: (_) => 'true',
    false: (_) => 'false',
    null: (_) => 'null',

    // The name of a source: an identifier, which can also have "-" between
    // its characters, e.g. my-source.
    // biome-ignore lint/complexity/noUselessEscapeInRegex: \p{L} is a Unicode class for Tree-sitter
    name: (_) => /[\p{L}$_][\p{L}\p{N}$_]*(-[\p{L}\p{N}$_]+)*/,

    // A JavaScript identifier, for the keys of a body. Tree-sitter reads
    // \p{…} without the u flag.
    // biome-ignore lint/complexity/noUselessEscapeInRegex: \p{L} is a Unicode class for Tree-sitter
    identifier: (_) => /[\p{L}$_][\p{L}\p{N}$_]*/,

    comment: (_) =>
      token(
        choice(seq('//', /[^\n]*/), seq('/*', /[^*]*\*+([^/*][^*]*\*+)*/, '/')),
      ),
  },
});
