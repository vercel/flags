; Highlights of flags files, with the capture names of Zed. The grammar
; (packages/tree-sitter-flags) has the same queries with the names of
; nvim-treesitter. Keep both in line.
;
; No two patterns capture the same node.

["source" "flag"] @keyword

(source_statement
  name: (_) @type)

(flag_statement
  name: (_) @function)

; The fields of a flag
(flag_statement
  body: (object
    (pair
      key: (_) @property)))

; The keys of a value or an option, at each depth
(pair
  value: (object
    (pair
      key: (_) @variable)))

(array
  (object
    (pair
      key: (_) @variable)))

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

(null) @constant

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
