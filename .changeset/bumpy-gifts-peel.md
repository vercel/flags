---
"@vercel/flags-core": minor
"@flags-sdk/vercel": minor
---

Allow specifying entities type when creating clients

You can now create clients while specifying the entities type:

```ts
type Entities = { user: { id: string, name?: string } }
const client = createClient<Entities>('')
client.evaluate('flagKey', undefined, { user: { id: '' } }) // uses Entities type for context
```

You can still narrow the entities type when evaluating flags:

```ts
client.evaluate<{ user: { id: string, name: string } }>(
  'flagKey',
  false,
  { user: { id: '', name: '' } } // uses custom entities type
)
```
