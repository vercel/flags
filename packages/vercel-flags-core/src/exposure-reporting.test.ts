import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultReportExposures } from './exposure-reporting';

describe('defaultReportExposures', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps known and custom entity bases to Web Analytics units', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    defaultReportExposures(
      [
        {
          flagKey: 'checkout',
          experimentId: 'exp_user',
          variantId: 'variant_a',
          base: ['user', 'key'],
          rampId: 'ramp_1',
          rampPercentage: 50,
          assignmentReason: 'experiment',
        },
        {
          flagKey: 'pricing',
          experimentId: 'exp_team',
          variantId: 'variant_b',
          base: ['team', 'key'],
          assignmentReason: 'targeted',
        },
        {
          flagKey: 'visitor',
          experimentId: 'exp_visitor',
          variantId: 'variant_c',
          base: ['visitor', 'id'],
          assignmentReason: 'split',
        },
        {
          flagKey: 'device',
          experimentId: 'exp_device',
          variantId: 'variant_d',
          base: ['device', 'key'],
          assignmentReason: 'override',
        },
      ],
      {
        user: { key: 'user_123' },
        team: { key: 'team_123' },
        visitor: { id: 'visitor_123' },
      },
    );

    expect(log).toHaveBeenNthCalledWith(
      1,
      '@vercel/flags-core: trackExposure',
      {
        experimentId: 'exp_user',
        variantId: 'variant_a',
        unitKey: 'user',
        unitValue: 'user_123',
        rampId: 'ramp_1',
        rampPercentage: 50,
        assignmentReason: 'experiment',
      },
    );
    expect(log).toHaveBeenNthCalledWith(
      2,
      '@vercel/flags-core: trackExposure',
      {
        experimentId: 'exp_team',
        variantId: 'variant_b',
        unitKey: 'group',
        unitValue: 'team_123',
        assignmentReason: 'targeted',
      },
    );
    expect(log).toHaveBeenNthCalledWith(
      3,
      '@vercel/flags-core: trackExposure',
      {
        experimentId: 'exp_visitor',
        variantId: 'variant_c',
        unitKey: 'event_data.visitorId',
        unitValue: 'visitor_123',
        assignmentReason: 'split',
      },
    );
    expect(log).toHaveBeenNthCalledWith(
      4,
      '@vercel/flags-core: trackExposure',
      {
        experimentId: 'exp_device',
        variantId: 'variant_d',
        unitKey: 'device',
        unitValue: 'fake-device-id',
        assignmentReason: 'override',
      },
    );
  });

  it('does not track an exposure whose entity value cannot be resolved', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    defaultReportExposures(
      [
        {
          flagKey: 'checkout',
          experimentId: 'exp_user',
          variantId: 'variant_a',
          base: ['user', 'key'],
          assignmentReason: 'experiment',
        },
      ],
      {},
    );

    expect(log).not.toHaveBeenCalled();
  });
});
