# @flags-sdk/devunus

Devunus adapter for [flags-sdk](https://github.com/vercel/flags).

- An adapter for loading feature flags from devunus (coming soon).
- A getProviderData function for use with the Flags Explorer (available today).

## Installation

```bash
npm install @flags-sdk/devunus
```

## Usage getProviderData

Use a server env key for DEVUNUS_ENV_KEY. You can find your environment key in the [Devunus Admin Console](https://app.devunus.com/admin/def/project/1/get-started/e0-0/keys).

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
