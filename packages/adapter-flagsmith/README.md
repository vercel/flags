# Flags SDK - Flagsmith Provider

A provider adapter for the Flags SDK that integrates with [Flagsmith](https://flagsmith.com/), allowing you to use Flagsmith's feature flags and remote configuration in your application.

## Installation

```bash
npm install @flags-sdk/adapter-flagsmith
# or
yarn add @flags-sdk/adapter-flagsmith
```

## Usage

```typescript
import { createFlagsmithAdapter } from '@flags-sdk/adapter-flagsmith';
import { flag } from 'flags';

// Create the Flagsmith adapter
const flagsmithAdapter = createFlagsmithAdapter({
  environmentID: 'your-environment-id',
  // Optional: Add any other Flagsmith configuration options
  // See: https://docs.flagsmith.com/clients/javascript/
});

// Define your flags
const myFeatureFlag = flag({
  key: 'my-feature',
  adapter: flagsmithAdapter,
});

// Use the flag in your application
const flag = await myFeatureFlag();
```

## Configuration

The adapter accepts all standard Flagsmith configuration options:

```typescript
interface IInitConfig {
  environmentID: string;
  api?: string;
  cache?: {
    enabled?: boolean;
    ttl?: number;
  };
  enableAnalytics?: boolean;
  enableLogs?: boolean;
  // ... see Flagsmith documentation for more options
}
```

## Features

- Seamless integration with Flagsmith's feature flag system
- Type-safe flag definitions
- Automatic initialization of the Flagsmith client
- Support for all Flagsmith configuration options
- Proper handling of default values

## License

MIT
