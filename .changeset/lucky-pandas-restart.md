---
'@vercel/flags-core': patch
---

Apply flag data again after a shutdown and a new initialization

`shutdown()` removes the event handlers of the stream source and the polling source. But no code added these handlers again. Thus a client that you initialize after a shutdown opens a new connection, but it ignores all data from that connection. Evaluations then give the default value, with the reason `error`.

This condition also applies to the `VercelProvider` OpenFeature provider. Its `onClose()` hook shuts the client down, and the OpenFeature specification permits a new initialization after a shutdown.

The handlers are now added each time a source starts. A client that you initialize again thus gets new data, as expected.
