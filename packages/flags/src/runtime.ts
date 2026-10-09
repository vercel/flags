import type { ReadonlyHeaders } from './types';

/**
 * Base class for runtimes. Extend it and override the lifecycle methods you need.
 */
export class Runtime {
  /**
   * Called once before the runtime handles its first invocation.
   */
  async onInit(): Promise<void> {}

  /**
   * Called for every invocation.
   */
  async onInvoke(_context: { headers: ReadonlyHeaders }): Promise<void> {}

  /**
   * Called once when the runtime shuts down.
   */
  async onShutdown(): Promise<void> {}
}
