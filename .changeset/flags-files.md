---
'flags': minor
'@flags-sdk/next': minor
'@flags-sdk/vite': minor
---

Flags files: declare the flags of an application in `app.flags` (`flag summer-sale { defaultValue: false }`), and import them with `import { summerSale } from './app.flags'`, or from their source with `import { summerSale } from 'flags:self'`, which has the flags of all flags files of the source. The framework plugins compile each flags file into `defineSource` and `source.bindFlag`, without the network. `node --import flags/register` does the same without a bundler. TypeScript 7.1 reads flags files with the content mapper of `flags` (`"contentMappers": [{ "package": "flags", "extensions": [".flags"] }]`). For older versions, the SDK writes `app.d.flags.ts` next to each file, for `allowArbitraryExtensions`. An application with flags files uses no catalogs. `flags format` formats flags files (`--check` for CI, `--stdin` for editors such as Zed), and `formatFlagsFile` of `flags/tooling` is the formatter.
