import { fullIdentifyExampleFlag } from './flags';
import { DemoFlag } from '@/components/demo-flag';
import { Button } from '@/components/ui/button';
import { cookies } from 'next/headers';

export default async function Page() {
  const full = await fullIdentifyExampleFlag();

  return (
    <>
      <DemoFlag name={fullIdentifyExampleFlag.key} value={full} />

      <div className="flex gap-2">
        <Button
          onClick={async () => {
            'use server';
            const cookiesStore = await cookies();
            cookiesStore.set('identify-example-user-id', 'user1');
          }}
          variant="outline"
        >
          Act as a flagged in user
        </Button>
        <Button
          onClick={async () => {
            'use server';
            const cookiesStore = await cookies();
            cookiesStore.set('identify-example-user-id', 'user2');
          }}
          variant="outline"
        >
          Act as a flagged out user
        </Button>
        <Button
          onClick={async () => {
            'use server';
            const cookiesStore = await cookies();
            cookiesStore.delete('identify-example-user-id');
          }}
          variant="outline"
        >
          Clear cookie
        </Button>
      </div>
    </>
  );
}
