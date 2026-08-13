# @flags-sdk/openfeature

## 0.1.3

### Patch Changes

- [#474](https://github.com/vercel/flags/pull/474) [`2dfc85c`](https://github.com/vercel/flags/commit/2dfc85c3ec1e7151dc9dcca30ee915e7cfbea5e4) Thanks [@dferber90](https://github.com/dferber90)! - Retry initialization after a failed attempt

  Previously a rejected `init()` was cached forever, so a single transient failure (e.g. a connect error during a cold start) made every later flag evaluation replay that same error for the rest of the process' lifetime, without ever dialing the provider again.

  The rejected attempt is now discarded so the next evaluation retries, while concurrent callers still share a single in-flight attempt. Failures reported by the provider as `PROVIDER_FATAL` — irrecoverable ones such as invalid credentials or configuration — remain cached, since retrying them cannot succeed.

## 0.1.2

### Patch Changes

- 5f3757a: drop tsconfig dependency

## 0.1.1

### Patch Changes

- fe72a22: enhance README
