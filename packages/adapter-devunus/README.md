# @flags-sdk/Devunus

Devunus adapter for [flags-sdk](https://github.com/vercel/flags).

- An adapter for loading feature flags from devunus (coming soon).
- A getProviderData function for use with the Flags Explorer (available today).

## Installation

```bash
npm install @flags-sdk/Devunus
```

## Usage getProviderData

`app/.well-known/vercel/flags/route.ts`:

```tsx
import { verifyAccess, type ApiData } from 'flags';
import { getProviderData } from '@flags-sdk/devunus';
import { NextResponse, type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const access = await verifyAccess(request.headers.get('Authorization'));
  if (!access) return NextResponse.json(null, { status: 401 });

  const flagData = await getProviderData({
    envKey: process.env.DEVUNUS_ENV_KEY,
  });

  return NextResponse.json<ApiData>(flagData);
}
```
