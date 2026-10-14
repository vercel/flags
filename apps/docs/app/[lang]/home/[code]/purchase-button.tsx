'use client';
import { track } from '@vercel/analytics';
import { Button } from '@vercel/geistdocs/components/button';
import { useToasts } from '@vercel/geistdocs/components/toasts';
import { USER_ID_COOKIE } from '@/lib/flags/constants';

function readUserId(): string | undefined {
  const match = document.cookie
    .split('; ')
    .find((cookie) => cookie.startsWith(`${USER_ID_COOKIE}=`));
  return match?.slice(USER_ID_COOKIE.length + 1);
}

export function PurchaseButton({ label }: { label: string }) {
  const { success } = useToasts();

  return (
    <Button
      className="rounded-full"
      onClick={() => {
        const userId = readUserId();
        if (!userId) {
          success({ text: 'No userId cookie, purchase not tracked.' });
          return;
        }
        // Exposures are reported with `unitKey: 'event_data.userId'`, so the
        // event must carry the same id as a property to be joined to them.
        track('purchase', { userId });
        success({ text: `Tracked a purchase for ${userId}.` });
      }}
      size="large"
    >
      {label}
    </Button>
  );
}
