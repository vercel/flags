'use client';

import { Button } from '@/components/ui/button';

export function RegenerateIdButton() {
  return (
    <Button
      type="button"
      onClick={() => {
        document.cookie =
          'marketing-visitor-id=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT';
        window.location.reload();
      }}
      variant="outline"
    >
      Regenerate random visitor id
    </Button>
  );
}
