import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { begin, finish, measure, measureSync, record } from './profile';

afterEach(() => {
  finish();
  vi.restoreAllMocks();
});

describe('initialization performance probes', () => {
  it('does not record work outside an initialization sample', async () => {
    begin();
    finish();
    await measure('authLookupMs', async () => 'token');
    measureSync('headerCheckMs', () => true);
    record('jsonParseMs', 5);
    expect(Object.values(finish().calls).every((calls) => calls === 0)).toBe(
      true,
    );
  });

  it('records sync and async boundaries, including failures, and resets samples', async () => {
    vi.spyOn(performance, 'now')
      .mockReturnValueOnce(10)
      .mockReturnValueOnce(10.25)
      .mockReturnValueOnce(20)
      .mockReturnValueOnce(20.5);
    begin();
    expect(measureSync('headerCheckMs', () => true)).toBe(true);
    await expect(
      measure('authLookupMs', async () => {
        throw new Error('test failure');
      }),
    ).rejects.toThrow('test failure');
    record('jsonParseMs', 0.125);
    const result = finish();
    expect(result.timings.headerCheckMs).toBe(0.25);
    expect(result.timings.authLookupMs).toBe(0.5);
    expect(result.timings.jsonParseMs).toBe(0.125);
    expect(result.calls.headerCheckMs).toBe(1);
    expect(result.calls.authLookupMs).toBe(1);
    expect(result.calls.jsonParseMs).toBe(1);
    begin();
    expect(
      Object.values(finish().timings).every((duration) => duration === 0),
    ).toBe(true);
  });
});

it('measures all eight scenarios in isolated processes without latency thresholds', () => {
  const stdout = execFileSync(
    process.execPath,
    [
      fileURLToPath(new URL('./init.mjs', import.meta.url)),
      '--samples',
      '1',
      '--json',
    ],
    { encoding: 'utf8' },
  );
  const report = JSON.parse(stdout) as {
    flagCount: number;
    freshProcesses: number;
    rows: {
      scenario: string;
      cache: 'cold' | 'warm';
      samples: number;
      metrics: Record<string, { median: number; p95: number }>;
      calls: Record<string, number>;
    }[];
  };
  expect(report.flagCount).toBe(31);
  expect(report.freshProcesses).toBe(8);
  expect(report.rows).toHaveLength(16);
  expect(new Set(report.rows.map((row) => row.scenario)).size).toBe(8);
  for (const row of report.rows) {
    expect(row.samples).toBe(1);
    expect(['cold', 'warm']).toContain(row.cache);
    for (const metric of Object.values(row.metrics)) {
      expect(Number.isFinite(metric.median)).toBe(true);
      expect(metric.median).toBeGreaterThanOrEqual(0);
      expect(metric.p95).toBe(metric.median);
    }
    const stream = row.scenario.includes('/stream-');
    const embedded = !row.scenario.endsWith('/stream-datafile');
    expect(row.calls.streamMs).toBe(stream ? 1 : 0);
    expect(row.calls.jsonParseMs).toBe(
      row.cache === 'cold' && embedded ? 1 : 0,
    );
    expect(row.calls.sdkKeyHashMs).toBe(
      row.scenario.startsWith('sdk-key/') ? 1 : 0,
    );
  }
}, 30_000);
