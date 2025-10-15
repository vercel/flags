import type { ReadonlyRequestCookies } from 'flags';
import { dedupe, flag } from 'flags/next';

interface Entities {
  user?: { id: string };
}

const identify = dedupe(
  ({ cookies }: { cookies: ReadonlyRequestCookies }): Entities => {
    const userId = cookies.get('identify-example-user-id')?.value;
    return { user: userId ? { id: userId } : undefined };
  },
);

export const fullIdentifyExampleFlag = flag<boolean, Entities>({
  key: 'full-identify-example-flag',
  identify,
  description: 'Full identify example',
  decide({ entities }) {
    console.log(entities);
    if (!entities?.user) return false;
    return entities.user.id === 'user1';
  },
});
