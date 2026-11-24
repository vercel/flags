# Flags files for Zed

Syntax highlighting for flags files (`*.flags`) of the
[Flags SDK](https://flags-sdk.dev) in [Zed](https://zed.dev):

- `source` and `flag`, the key of each flag, the fields, the values and
  the comments;
- brackets, auto-indentation, and comments with `cmd-/`;
- each flag in the outline (`cmd-shift-o`).

## Format on save

An extension of Zed can not give a formatter without a language server.
The command `flags format --stdin` of the `flags` package is the
formatter. Add it to `.zed/settings.json` of the project (or to the
settings of Zed), and Zed formats each flags file when you save it, or
with "editor: format":

```json
{
  "languages": {
    "Flags": {
      "formatter": {
        "external": {
          "command": "npx",
          "arguments": ["--no", "flags", "format", "--stdin", "--stdin-filepath", "{buffer_path}"]
        }
      }
    }
  }
}
```

`npx --no` uses the `flags` of the project, and does not download it.
Zed starts the command in the root of the project. If `flags` is in a
package of a monorepo, use its path as the command, e.g.
`"command": "apps/web/node_modules/.bin/flags"` and
`"arguments": ["format", "--stdin", "--stdin-filepath", "{buffer_path}"]`.
With a syntax error, the command fails, Zed shows the error, and the file
stays as it is.

The grammar is `packages/tree-sitter-flags` of this repository. It also
works in other editors with Tree-sitter, e.g. Neovim and Helix.

## Try it

Zed builds the grammar from a commit of a Git repository, and only from
the committed files. Prepare a dev copy of the extension:

```sh
pnpm --filter tree-sitter-flags generate   # after a change of grammar.js
node packages/zed-flags/scripts/dev.mjs
```

If `packages/tree-sitter-flags` has no uncommitted changes, the dev copy
uses this repository at the current commit. Otherwise it uses a snapshot
of the grammar in a new Git repository, so that you can try a change
before you commit it.

The script prints a directory. In Zed, run "zed: install dev extension"
from the command palette, and select it. Run the script again after each
change of the grammar or of the queries, and install the new directory.

## Publish it

1. Commit `packages/tree-sitter-flags`, with its generated `src`.
2. Set `rev` in `extension.toml` to that commit.
3. Open a pull request in
   [zed-industries/extensions](https://github.com/zed-industries/extensions)
   which adds this directory.

## Files

| File | Purpose |
| --- | --- |
| `extension.toml` | The extension, and where its grammar is |
| `languages/flags/config.toml` | The file type, comments and brackets |
| `languages/flags/highlights.scm` | The highlights, with the capture names of Zed |
| `languages/flags/brackets.scm` | The pairs of brackets |
| `languages/flags/indents.scm` | Auto-indentation |
| `languages/flags/outline.scm` | The flags in the outline |

`highlights.scm` is the same as `packages/tree-sitter-flags/queries/highlights.scm`,
with the capture names of Zed. Change both together.
