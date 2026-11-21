# Flags files for VS Code

Support for flags files (`*.flags`) of the [Flags SDK](https://flags-sdk.dev):

- Syntax highlighting: `source`, `flag` and the key of each flag, the
  fields and the type. The body of a flag is JSON5. The grammar marks what
  a flags file does not allow: an unknown field (e.g. `defualtValue`), a
  key with `.` without quotes, `#` comments, statements other than
  `source` and `flag`, and expressions such as references or operators.
- Snippets: `flag`, `string`, `number`, `object` and `source`.
- With TypeScript 7.1 (the extension "TypeScript (Native Preview)"), the
  content mapper of `flags` gives the imports of flags files their types,
  go to definition goes from an import to the flag, and the errors of a
  flags file show in the editor. Add the content mapper to `tsconfig.json`:

  ```json
  {
    "contentMappers": [{ "package": "flags", "extensions": [".flags"] }]
  }
  ```

On GitHub, `*.flags linguist-language=JSON5` in `.gitattributes`
highlights the strings, the keys and the comments.

To try the extension, open this folder in VS Code and press F5, or run
`npx @vscode/vsce package` and install the `.vsix` file.
