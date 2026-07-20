---
"flags": patch
---

Allow passing a `NextRequest` / Web `Request` directly to `flag(req)` and `evaluate(flags, req)` outside App Router (e.g. in routing middleware).

Previously only a Pages Router `IncomingMessage`, or a manually-flattened headers object, worked when calling a flag directly — passing a `NextRequest` produced empty headers because it wasn't recognized as already having a `Headers` instance.
