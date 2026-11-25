---
'flags': minor
---

A provider flag is declared on its source: `source.bindFlag(key, options)` replaces `bindFlag({ key, source, ...options })`. `defineSource` returns a `BindableSource`. The options are the same, without `key` and `source`. Inline flags still use `defineFlag({ key, decide })`.
