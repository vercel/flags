This is the manually written design doc.

Components

- flag evaluation mechanism (defineFlag, defineSource)
  - source consists of provider, catalog (one-time get, poll), context fn
  - framework injection of scope (request)
- code generation (creates `flags:site` alias and underlying files)
  - could actually generate into `flags/sources/<source>/flags.ts`, so protocol would work even without code generation

```ts
// creating an inline flag
defineFlag({
  key: "enableDashboard",
  decide: () => {},
});

// this can get auto-generated or written manually
const source = defineSource({ provider, getEvaluationContext });

// using a flag from a provider
bindFlag({
  key: "enableDashboard",
  source: source,
  options: [false, true] as const,
});
```
