'use client';

import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

export function ReloadButton() {
  const router = useRouter();

  return (
    <Button
      type="button"
      onClick={() => {
        router.refresh();
      }}
      variant="outline"
    >
      Reload page
    </Button>
  );
}
