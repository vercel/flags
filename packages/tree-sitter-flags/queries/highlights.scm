; Highlights of flags files, with the capture names of nvim-treesitter and
; Helix. The Zed extension has its own copy, with the names of Zed.
;
; No two patterns capture the same node: editors do not agree which of two
; captures wins.

["source" "flag"] @keyword

(source_statement
  name: (_) @module)

(flag_statement
  key: (_) @function)

; The fields of a flag
(flag_statement
  body: (object
    (pair
      key: (_) @property)))

; The keys of a value or an option, at each depth
(pair
  value: (object
    (pair
      key: (_) @variable.member)))

(array
  (object
    (pair
      key: (_) @variable.member)))

; Strings as values, not as keys
(pair
  value: (string) @string)

(array
  (string) @string)

(escape_sequence) @string.escape

(number) @number

[
  (true)
  (false)
] @boolean

(null) @constant.builtin

(comment) @comment

[
  "{"
  "}"
  "["
  "]"
] @punctuation.bracket

[
  ":"
  ","
] @punctuation.delimiter
