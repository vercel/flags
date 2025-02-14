'use client';

import { Button } from '@/components/ui/button';
import { useFlagContext } from '@vercel/flags/react';
import { DemoFlag } from '@/components/demo-flag';
import { useRouter } from 'next/navigation';
import type { FlagValuesType } from '@vercel/flags';

export default function Page() {
  const dashboard = useFlagContext<boolean>('dashboard-flag');
  const router = useRouter();
  return (
    <>
      <DemoFlag name="dashboard-flag" value={dashboard} />
      <div className="flex gap-2">
        <Button
          onClick={() => {
            document.cookie = 'dashboard-user-id=user1; path=/';
            router.refresh();
          }}
          variant="outline"
        >
          Act as a flagged in user
        </Button>
        <Button
          onClick={() => {
            document.cookie = 'dashboard-user-id=user2; path=/';
            router.refresh();
          }}
          variant="outline"
        >
          Act as a regular user
        </Button>
        <Button
          onClick={() => {
            document.cookie =
              'dashboard-user-id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
            router.refresh();
          }}
          variant="outline"
        >
          Clear cookie
        </Button>
      </div>
    </>
  );
}
