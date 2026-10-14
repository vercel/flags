'use client';

import { track } from '@vercel/analytics';

export function AndyButton() {
  return (
    <button
      type="button"
      onClick={() => {
        let visitorId = '';

        const cookies = document.cookie.split(';');
        cookies.forEach((str) => {
          const [key, value] = str.split('=');
          if (key === 'visitorId') {
            visitorId = value;
          }
        });

        track('purchase', { visitorId });
      }}
    >
      Andy's Button
    </button>
  );
}
