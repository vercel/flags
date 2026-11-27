---
'@flags-sdk/openfeature': patch
---

Add `close()` to the adapter

`close()` reverts the adapter to its uninitialized state, so the next flag evaluation initializes it again, as the OpenFeature provider specification describes for shutdown. An initialization that is still in flight is awaited first, and repeated calls without an intervening evaluation do nothing further.

Pass the new `onClose` option to dispose of whatever your `init` function set up, e.g. `{ onClose: () => OpenFeature.close() }`. The adapter cannot do this on your behalf, because an OpenFeature client cannot be closed on its own, and shutting down providers means closing them on the global `OpenFeature` API, which would also affect providers this adapter never registered.
