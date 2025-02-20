import type { ReadonlyRequestCookies } from 'flags';
import { flag, dedupe } from 'flags/next';

interface Entities {
  user?: { id: string };
}

const identify = dedupe(
  ({ cookies }: { cookies: ReadonlyRequestCookies }): Entities => {
    const userId = cookies.get('dashboard-user-id')?.value;
    return { user: userId ? { id: userId } : undefined };
  },
);

export const dashboardFlag = flag<boolean, Entities>({
  key: 'dashboard-flag',
  identify,
  description: 'Flag used on the Dashboard Pages example',
  decide({ entities }) {
    if (!entities?.user) return false;
    // Allowed users could be loaded from Edge Config or elsewhere
    const allowedUsers = ['user1'];

    return allowedUsers.includes(entities.user.id);
  },
});
