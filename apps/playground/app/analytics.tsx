'use client';

import { Analytics, type BeforeSendEvent } from '@vercel/analytics/react';

function beforeSend(event: BeforeSendEvent) {
  if (
    event.type === 'event' &&
    !new URL(event.url).pathname.startsWith('/checkout')
  ) {
    return null;
  }
  return event;
}

export function AnalyticsProvider() {
  return <Analytics beforeSend={beforeSend} />;
}
