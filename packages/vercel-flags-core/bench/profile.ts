// Benchmark-only probes. These are bundled into the temporary worker, never the SDK.
export const phases = [
  'createClientMs',
  'initializeMs',
  'bundledMs',
  'bundleImportMs',
  'authLookupMs',
  'sdkKeyHashMs',
  'jsonParseMs',
  'headerCheckMs',
  'streamMs',
  'streamAuthMs',
] as const;

export type Phase = (typeof phases)[number];
export type Measurements = Record<Phase, number>;

let active = false;
let timings = empty();
let calls = empty();

function empty(): Measurements {
  return Object.fromEntries(phases.map((phase) => [phase, 0])) as Measurements;
}

export function begin(): void {
  timings = empty();
  calls = empty();
  active = true;
}

export function record(phase: Phase, duration: number): void {
  if (!active) return;
  timings[phase] += duration;
  calls[phase] += 1;
}

export async function measure<T>(
  phase: Phase,
  fn: () => T | Promise<T>,
): Promise<T> {
  if (!active) return fn();
  const start = performance.now();
  try {
    return await fn();
  } finally {
    record(phase, performance.now() - start);
  }
}

export function measureSync<T>(phase: Phase, fn: () => T): T {
  if (!active) return fn();
  const start = performance.now();
  try {
    return fn();
  } finally {
    record(phase, performance.now() - start);
  }
}

export function finish() {
  active = false;
  return { timings: { ...timings }, calls: { ...calls } };
}
