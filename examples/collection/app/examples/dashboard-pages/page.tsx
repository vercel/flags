import { dashboardFlag } from './flags';
import { DemoFlag } from '@/components/demo-flag';
import { Button } from '@/components/ui/button';
import { cookies } from 'next/headers';

export default async function Page() {
  const dashboard = await dashboardFlag();

  return (
    <>
      <DemoFlag name={dashboardFlag.key} value={dashboard} />
      <div className="flex gap-2">
        <Button
          onClick={async () => {
            'use server';
            const cookiesStore = await cookies();
            cookiesStore.set('dashboard-user-id', 'user1');
          }}
          variant="outline"
        >
          Act as a flagged in user
        </Button>
        <Button
          onClick={async () => {
            'use server';
            const cookiesStore = await cookies();
            cookiesStore.set('dashboard-user-id', 'user2');
          }}
          variant="outline"
        >
          Act as a regular user
        </Button>
        <Button
          onClick={async () => {
            'use server';
            const cookiesStore = await cookies();
            cookiesStore.delete('dashboard-user-id');
          }}
          variant="outline"
        >
          Clear cookie
        </Button>
      </div>
    </>
  );
}
