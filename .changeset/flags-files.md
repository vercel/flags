---
'flags': minor
'@flags-sdk/next': minor
'@flags-sdk/vite': minor
---

Flags files: declare the flags of an application in `app.flags` (`flag summerSale { key: "summer-sale", defaultValue: false }`: the name which the code imports, and the key in the flag management system), and import them with `import { summerSale } from './app.flags'`, or from their source with `import { summerSale } from 'flags:self'`, which has the flags of the source from all flags files. A flag can set its own `source`. The framework plugins compile each flags file into `defineSource` and `source.bindFlag`, without the network. `node --import flags/register` does the same without a bundler. For the types, the SDK writes `app.d.flags.ts` next to each file, for `allowArbitraryExtensions`, and TypeScript 7.1 can also read flags files with the content mapper of `flags` (`"contentMappers": [{ "package": "flags", "extensions": [".flags"] }]`). An application with flags files uses no catalogs. `flags format` formats flags files (`--check` for CI, `--stdin` for editors such as Zed), and `formatFlagsFile` of `flags/tooling` is the formatter.
