'use client';
import { track } from '@vercel/analytics';

export function Example() {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => {
          track('exposure', {
            experiment: 'fake-experiment', // identifies the experiment
            variantId: 'var0', // e.g. "control" or "treatment"
            visitorId: 'vis_abc123', // e.g. "visitorId": "vis_abc123"
            // '<unitField>': '<unit-id>', // e.g. "visitorId": "vis_abc123"
          });
        }}
      >
        track exposure
      </button>
      <button
        type="button"
        onClick={() => {
          track('example-event', {
            visitorId: 'vis_abc123', // e.g. "visitorId": "vis_abc123"
            // '<unitField>': '<unit-id>', // e.g. "visitorId": "vis_abc123"
          });
        }}
      >
        track event
      </button>
    </div>
  );
}
