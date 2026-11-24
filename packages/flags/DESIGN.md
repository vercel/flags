This is the manually written design doc.

Components

- flag evaluation mechanism (defineFlag, defineSource)
  - source consists of provider, context fn, hooks (`flags/sources/<source>/`: `provider.ts`, `context.ts`, `hooks.ts`)
  - framework injection of scope (request)
- flags files (`*.flags`): the declarations of the flags (name, key, type, options, description, defaultValue). The flag management system keeps the values.
  - each flags file compiles to one `defineSource` per source and one `source.bindFlag` per flag
- code generation (creates the `flags:<source>` aliases, `.flags/<source>.ts` and the types) from the flags files only. No network, no credentials.

```ts
// creating an inline flag
defineFlag({
  key: "enableDashboard",
  decide: () => {},
});

// a flags file compiles to this, or you write it manually
const source = defineSource({ provider, getEvaluationContext });

// using a flag from a provider
source.bindFlag("enableDashboard", {
  options: [false, true] as const,
});
```
