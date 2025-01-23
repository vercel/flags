---
'@vercel/flags': minor
---

Add `mergeProviderData` function to `@vercel/flags`.

This function allows merging ProviderData from multiple sources.

This is handy when you declare feature flags in code, and want to extend those definitions with data loaded from your feature flag provider.

```ts
import { verifyAccess, mergeProviderData, type ApiData } from '@vercel/flags';
import { getProviderData } from '@vercel/flags/next';
import { NextResponse, type NextRequest } from 'next/server';
import { getProviderData as getStatsigProviderData } from '@flags-sdk/statsig';
import * as flagsA from '../../../../flags-a'; // your feature flags file(s)
import * as flagsB from '../../../../flags-b'; // your feature flags file(s)

export async function GET(request: NextRequest) {
  const access = await verifyAccess(request.headers.get('Authorization'));
  if (!access) return NextResponse.json(null, { status: 401 });

  const providerData = await mergeProviderData([
    // expose flags declared in code first
    getProviderData(flagsA),
    getProviderData(flagsB),
    // then enhance them with metadata from your flag provider
    getStatsigProviderData({ consoleApiKey: '', projectId: '' }),
  ]);

  return NextResponse.json<ApiData>(providerData);
}
```
