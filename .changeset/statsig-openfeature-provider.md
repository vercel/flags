---
'@flags-sdk/statsig': minor
---

Add `StatsigProvider`, an OpenFeature server provider for Statsig, at `@flags-sdk/statsig/openfeature`. It uses the Statsig Server Core SDK (`@statsig/statsig-node-core`). A plain flag key reads a feature gate. The prefixes `config:`, `experiment:` and `layer:` read a dynamic config, an experiment or a layer, and a `.<param>` suffix reads one parameter. The v4 adapter does not change.
