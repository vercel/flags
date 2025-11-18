'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';

export function Toaster() {
  useEffect(() => {
    const message = sessionStorage.getItem('toast');

    // artificial delay to avoid distracting the user
    // with the toast, so they realize the flag change itself first
    let timeoutId: NodeJS.Timeout | undefined;
    if (message) {
      timeoutId = setTimeout(() => {
        toast(message, {
          duration: 9000,
        });
        sessionStorage.removeItem('toast');
      }, 500);

      return () => {
        clearTimeout(timeoutId);
      };
    }
  }, []);

  return null;
}
