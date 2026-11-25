---
'flags': major
---

Flags SDK v5: one standard for every framework, built on OpenFeature. Flags come from OpenFeature providers through sources (`defineSource`, `source.bindFlag`), or are inline flags (`defineFlag`). The file system API (`flags/sources/<source>/`) generates `import { … } from 'flags:<source>'`, and the framework packages (`@flags-sdk/next`, `@flags-sdk/sveltekit`, `@flags-sdk/nuxt`, `@flags-sdk/tanstack-start`, `@flags-sdk/hono`, `@flags-sdk/express`, `@flags-sdk/vite`) connect the SDK to each framework. See the guide "Upgrading from v4".
