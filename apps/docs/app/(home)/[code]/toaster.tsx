'use client';

import { useToasts } from '@vercel/geist/components';
import { useEffect } from 'react';

export function Toaster() {
  const toasts = useToasts();

  useEffect(() => {
    const message = sessionStorage.getItem('toast');

    // artificial delay to avoid distracting the user
    // with the toast, so they realize the flag change itself first
    let timeoutId: NodeJS.Timeout | undefined;
    if (message) {
      timeoutId = setTimeout(() => {
        toasts.message({
          text: message,
          preserve: true,
          timeout: 9000,
        });
        sessionStorage.removeItem('toast');
      }, 500);

      return () => {
        clearTimeout(timeoutId);
      };
    }
  }, [toasts]);

  return null;
}
