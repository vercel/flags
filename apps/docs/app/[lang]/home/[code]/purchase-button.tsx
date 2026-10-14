'use client';
import { identify, track } from '@vercel/analytics';
import { Button } from '@vercel/geistdocs/components/button';
import { useToasts } from '@vercel/geistdocs/components/toasts';
import { useEffect } from 'react';
import { USER_ID_COOKIE } from '@/lib/flags/constants';

function readUserId(): string | undefined {
  const match = document.cookie
    .split('; ')
    .find((cookie) => cookie.startsWith(`${USER_ID_COOKIE}=`));
  return match?.slice(USER_ID_COOKIE.length + 1);
}

export function PurchaseButton({ label }: { label: string }) {
  const { success } = useToasts();

  // Exposures are reported with `unitKey: 'user'`, so the browser SDK has to
  // know the same user id for the purchase event to join to them.
  useEffect(() => {
    const userId = readUserId();
    if (userId) {
      identify(userId);
    }
  }, []);

  return (
    <Button
      className="rounded-full"
      onClick={() => {
        track('purchase');
        success({ text: 'Tracked a purchase event.' });
      }}
      size="large"
    >
      {label}
    </Button>
  );
}
