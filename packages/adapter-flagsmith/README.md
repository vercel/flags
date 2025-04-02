# Flags SDK - Flagsmith Provider

A provider adapter for the Flags SDK that integrates with [Flagsmith](https://flagsmith.com/), allowing you to use Flagsmith's feature flags and remote configuration in your application.

## Installation

```bash
npm install @flags-sdk/flagsmith
```

## Usage

An Enviroment ID must be provided either using `FLAGSMITH_ENVIRONMENT_ID` environment variable or setting `environmentID` property in the initialization parameters

```typescript
import { flagsmithAdapter } from '@flags-sdk/flagsmith';
import { flag } from 'flags';

// Lazy Mode
const myFeatureFlag = flag({
  key: 'my-feature',
  adapter: flagsmithAdapter.getFeature(),
});

// Custom initialization
const myFeatureFlag = flag({
  key: 'my-feature',
  adapter: flagsmithAdapter.getFeature({
    key: 'other-feature',
    api: 'https://custom-api.com',
    environmentID: 'ABC',
  }),
});
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
