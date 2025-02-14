import { FlagContextProvider } from '@vercel/flags/react';
import { dashboardFlag } from './flags';

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const dashboard = await dashboardFlag();

  return (
    <FlagContextProvider values={{ [dashboardFlag.key]: dashboard }}>
      {children}
    </FlagContextProvider>
  );
}
