---
"@vercel/flags-core": minor
---

This version of the SDK will no longer fall back to polling in case of streaming issues, and rely on the current in-memory version of the datafile instead, or fall back to the embedded datafile if no in-memory version is available.

- Rename `FlagNetworkDataSource` to `Controller` (old name still exported as alias)
- Rename `FlagNetworkDataSourceOptions` to `ControllerOptions` (old name still exported as alias)
- Rename `DataSource` interface to `ControllerInterface`
- Add optional `revision` field to `DatafileInput`
