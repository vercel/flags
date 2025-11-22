# @vercel/flags-adapter-databuddy

Databuddy adapter for the Vercel Flags SDK. This adapter allows you to use [Databuddy](https://databuddy.cc) as your feature flag provider with Vercel's Flags SDK and Toolbar.

## Features

- ✅ Boolean flags
- ✅ Multi-variant flags (string, number, object)
- ✅ Gradual rollouts
- ✅ Flag dependencies
- ✅ Multi-environment support (dev, staging, production)
- ✅ Server-side caching
- ✅ User targeting and segmentation

## Installation

```bash
npm install @vercel/flags-adapter-databuddy
# or
pnpm add @vercel/flags-adapter-databuddy
# or
yarn add @vercel/flags-adapter-databuddy
```

## Setup

### 1. Add Environment Variables

```env
DATABUDDY_CLIENT_ID=your_client_id
DATABUDDY_API_KEY=your_api_key
```

### 2. Create Flags API Route

Create `.well-known/vercel/flags/route.ts` in your Next.js app:

```typescript
import { getProviderData } from '@vercel/flags-adapter-databuddy/provider';
import { NextResponse } from 'next/server';

export async function GET() {
  const data = await getProviderData({
    clientId: process.env.DATABUDDY_CLIENT_ID!,
    apiKey: process.env.DATABUDDY_API_KEY!,
    environment: process.env.NODE_ENV || 'production',
  });

  return NextResponse.json(data);
}
```

### 3. Define Flags

Create your flag definitions with the Databuddy adapter:

```typescript
// flags.ts
import { flag } from 'flags/next';
import { createDatabuddyAdapter } from '@vercel/flags-adapter-databuddy';

const adapter = createDatabuddyAdapter({
  clientId: process.env.DATABUDDY_CLIENT_ID!,
  apiKey: process.env.DATABUDDY_API_KEY,
  environment: process.env.NODE_ENV || 'production',
});

// Boolean flag
export const showNewFeature = flag({
  key: 'show-new-feature',
  adapter,
  defaultValue: false,
  description: 'Show the new feature to users',
});

// Multi-variant flag
export const pricingTier = flag({
  key: 'pricing-tier',
  adapter,
  defaultValue: 'standard',
  options: ['basic', 'standard', 'premium'],
  description: 'User pricing tier',
});
```

### 4. Use Flags in Your App

#### In Server Components

```typescript
import { showNewFeature, pricingTier } from './flags';

export default async function Page() {
  const isNewFeatureEnabled = await showNewFeature();
  const tier = await pricingTier();

  return (
    <div>
      {isNewFeatureEnabled && <NewFeature />}
      <PricingDisplay tier={tier} />
    </div>
  );
}
```

#### In API Routes

```typescript
import { NextRequest } from 'next/server';
import { showNewFeature } from './flags';

export async function GET(request: NextRequest) {
  const isEnabled = await showNewFeature();

  if (!isEnabled) {
    return Response.json({ error: 'Feature not available' }, { status: 403 });
  }

  return Response.json({ data: '...' });
}
```

## Advanced Usage

### User Targeting

You can identify users for targeted flag evaluation:

```typescript
const adapter = createDatabuddyAdapter({
  clientId: process.env.DATABUDDY_CLIENT_ID!,
  apiKey: process.env.DATABUDDY_API_KEY,
  environment: process.env.NODE_ENV || 'production',
  identifyUser: async ({ headers, cookies }) => {
    // Get user from session, JWT, etc.
    const userId = cookies.get('userId')?.value;
    return {
      userId,
      email: 'user@example.com',
      properties: {
        plan: 'premium',
        beta: true,
      },
    };
  },
});
```

### Custom Cache TTL

```typescript
const adapter = createDatabuddyAdapter({
  clientId: process.env.DATABUDDY_CLIENT_ID!,
  cacheTtl: 30000, // 30 seconds
});
```

### Self-Hosted Databuddy

```typescript
const adapter = createDatabuddyAdapter({
  clientId: process.env.DATABUDDY_CLIENT_ID!,
  apiUrl: 'https://your-databuddy-instance.com',
  dashboardUrl: 'https://dashboard.your-databuddy-instance.com',
});
```

## API Reference

### `getProviderData(options)`

Fetches flag definitions from Databuddy for the Vercel Toolbar.

#### Options

- `clientId` (string, required): Your Databuddy client ID
- `apiKey` (string, required): Your Databuddy API key
- `apiUrl` (string, optional): Custom API URL for self-hosted instances
- `dashboardUrl` (string, optional): Custom dashboard URL for self-hosted instances
- `environment` (string, optional): Environment context (dev, staging, production). Default: `'production'`

### `createDatabuddyAdapter(options)`

Creates a Databuddy adapter for runtime flag evaluation.

#### Options

- `clientId` (string, required): Your Databuddy client ID
- `apiKey` (string, optional): Your Databuddy API key (recommended for server-side)
- `apiUrl` (string, optional): Custom API URL for self-hosted instances
- `environment` (string, optional): Environment context. Default: `'production'`
- `identifyUser` (function, optional): User identification function
- `cacheTtl` (number, optional): Cache TTL in milliseconds. Default: `60000` (1 minute)

## Features Supported

### Multi-Variant Flags

Databuddy supports multi-variant flags with string, number, or object values:

```typescript
export const buttonColor = flag({
  key: 'button-color',
  adapter,
  defaultValue: 'blue',
  options: ['blue', 'green', 'red'],
});
```

### Flag Dependencies

Flags can depend on other flags. The adapter automatically includes dependency information in the toolbar.

### Scheduled Rollouts

Databuddy supports scheduled flag changes and gradual rollouts. These are managed in the Databuddy dashboard and evaluated server-side.

### Multi-Environment

Flags can have different configurations per environment (dev, staging, production):

```typescript
// Development environment
const devAdapter = createDatabuddyAdapter({
  clientId: process.env.DATABUDDY_CLIENT_ID!,
  environment: 'development',
});

// Production environment
const prodAdapter = createDatabuddyAdapter({
  clientId: process.env.DATABUDDY_CLIENT_ID!,
  environment: 'production',
});
```

## Contributing

Contributions are welcome! Please see the [Vercel Flags repository](https://github.com/vercel/flags) for contribution guidelines.

## License

MIT © [Vercel](https://vercel.com)
