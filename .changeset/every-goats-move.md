---
"@vercel/flags-core": patch
---

Fixed an issue where concurrent flag evaluations (e.g. `Promise.all([client.evaluate('a'), client.evaluate('b')])`) would each trigger a separate initialization, causing a flood of network requests to the flags service. Also fixed stream disconnect during initialization from starting a duplicate polling cycle.
