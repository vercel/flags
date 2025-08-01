# Flags SDK - Flagsmith Provider

A provider adapter for the Flags SDK that integrates with [Flagsmith](https://flagsmith.com/), allowing you to use Flagsmith's feature flags and remote configuration in your application.

## Installation

```bash
npm install @flags-sdk/flagsmith
```

## Usage

An Environment ID must be provided using the `FLAGSMITH_ENVIRONMENT_ID` environment variable.

```typescript
import { flagsmithAdapter } from '@flags-sdk/flagsmith';
import { flag } from 'flags';

// Boolean flags - returns flagState.enabled
const myBooleanFlag = flag({
  key: 'my-boolean-feature',
  adapter: flagsmithAdapter.booleanValue(),
});

// String flags - returns flagState.value when enabled
const myStringFlag = flag({
  key: 'my-string-feature',
  adapter: flagsmithAdapter.stringValue(),
});

// Number flags - returns flagState.value when enabled
const myNumberFlag = flag({
  key: 'my-number-feature',
  adapter: flagsmithAdapter.numberValue(),
});
```

## API

The adapter provides three methods for different flag types:

### `booleanValue()`

Returns an adapter for boolean flags. Uses `flagState.enabled` directly.

```typescript
const booleanAdapter = flagsmithAdapter.booleanValue();
const value = await booleanAdapter.decide({
  key: 'my-flag',
  defaultValue: false,
  entities: { identifier: 'user-123' },
});
```

### `stringValue()`

Returns an adapter for string flags. Returns `flagState.value` when the flag is enabled, otherwise returns the default value.

```typescript
const stringAdapter = flagsmithAdapter.stringValue();
const value = await stringAdapter.decide({
  key: 'my-flag',
  defaultValue: 'default',
  entities: { identifier: 'user-123' },
});
```

### `numberValue()`

Returns an adapter for number flags. Returns `flagState.value` when the flag is enabled, otherwise returns the default value.

```typescript
const numberAdapter = flagsmithAdapter.numberValue();
const value = await numberAdapter.decide({
  key: 'my-flag',
  defaultValue: 0,
  entities: { identifier: 'user-123' },
});
```

## Identity Handling

The adapter supports Flagsmith identity management. Pass an `IIdentity` object to the `entities` parameter:

```typescript
const identity: IIdentity = {
  identifier: 'user-123',
  traits: {
    email: 'user@example.com',
    plan: 'premium',
  },
};

const value = await adapter.decide({
  key: 'my-flag',
  defaultValue: false,
  entities: identity,
});
```

## Configuration

The adapter automatically initializes Flagsmith with the following configuration:

- `environmentId`: From `FLAGSMITH_ENVIRONMENT_ID` environment variable

## Features

- **Type-safe flag definitions**: Each method returns a properly typed adapter
- **Automatic initialization**: Flagsmith client can be lazily initialized
- **Identity support**: Full support for Flagsmith identity and traits
- **Default value handling**: Proper fallback to default values when flags are disabled or not found
- **Boolean flag optimization**: Boolean flags use the `enabled` state directly for better performance

## Environment Variables

- `FLAGSMITH_ENVIRONMENT_ID` (required): Your Flagsmith environment ID

## License

MIT
