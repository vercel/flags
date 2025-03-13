import { describe, it, expect } from 'vitest';
import { createFlagsmithAdapter } from '.';

describe('Flagsmith Adapter', () => {
  it('should initialize the adapter', async () => {
    const adapter = createFlagsmithAdapter({
      environmentID: 'test-key',
    });
    expect(adapter).toBeDefined();
  });
});
