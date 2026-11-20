---
'@flags-sdk/next': patch
---

The build no longer waits for open connections while it writes `flags-manifest.json`. A provider which connects when its module loads, e.g. LaunchDarkly, kept the process of the manifest alive until its timeout of 60 seconds, and the build failed.
