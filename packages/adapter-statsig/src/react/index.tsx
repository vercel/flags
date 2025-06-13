'use client';

import type { Statsig, StatsigUser } from 'statsig-node-lite';
import {
  StatsigProvider,
  useClientBootstrapInit,
  StatsigOptions,
} from '@statsig/react-bindings';
import React, { useMemo } from 'react';
import { useBootstrapData } from 'flags/react';

function BootstrappedStatsigProvider({
  user,
  values,
  children,
  statsigOptions,
  sdkKey,
}: {
  user: Parameters<typeof useClientBootstrapInit>[1];
  values: Parameters<typeof useClientBootstrapInit>[2];
  children: React.ReactNode;
  statsigOptions?: StatsigOptions;
  sdkKey?: string;
}) {
  const client = useClientBootstrapInit(
    sdkKey ?? (process.env.NEXT_PUBLIC_STATSIG_CLIENT_KEY as string),
    user,
    values,
    statsigOptions,
  );
  return <StatsigProvider client={client}>{children}</StatsigProvider>;
}

export function EmbeddedStatsigProvider({
  children,
  statsigOptions,
  sdkKey,
}: {
  children: React.ReactNode;
  statsigOptions?: StatsigOptions;
  sdkKey?: string;
}) {
  const data = useBootstrapData<{
    statsigUser: StatsigUser;
    clientInitializeResponse: Awaited<
      ReturnType<typeof Statsig.getClientInitializeResponse>
    >;
  }>();

  const values = useMemo(
    () => (data ? JSON.stringify(data.clientInitializeResponse) : null),
    [data],
  );

  if (!data || !values) {
    return children;
  }

  return (
    <BootstrappedStatsigProvider
      user={data.statsigUser}
      values={values}
      statsigOptions={statsigOptions}
      sdkKey={sdkKey}
    >
      {children}
    </BootstrappedStatsigProvider>
  );
}
