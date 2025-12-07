import type { BundledDefinitions } from '../types';
import { readBundledDefinitions } from '../utils/read-bundled-definitions';
import type { DataSource } from './interface';

async function* streamAsyncIterable(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Implements the DataSource interface for Edge Config.
 */
export class FlagNetworkDataSource implements DataSource {
  sdkKey?: string;
  bundledDefinitions: BundledDefinitions | null = null;
  definitions: BundledDefinitions | null = null;
  streamInitPromise: Promise<BundledDefinitions> | null = null;
  _loopPromise: Promise<void> | undefined;
  breakLoop: boolean = false;
  resolveStreamInitPromise: undefined | ((value: BundledDefinitions) => void);
  rejectStreamInitPromise: undefined | ((reason?: any) => void);
  initialized?: boolean = false;

  constructor(options: {
    sdkKey: string;
  }) {
    this.sdkKey = options.sdkKey;

    // preload from embedded json AND set up stream,
    // and only ever read from in-memory data
    this.bundledDefinitions = readBundledDefinitions(this.sdkKey);
  }

  async subscribe() {
    // only init lazily to prevent opening streams when a page
    // has no flags anyhow and just the client is imported
    if (this.initialized) return;
    this.initialized = true;

    const isBuildStep =
      process.env.CI === '1' ||
      process.env.NEXT_PHASE === 'phase-production-build';

    if (isBuildStep) {
      this.initialized = true;
      return;
    }

    this.streamInitPromise = new Promise((resolve, reject) => {
      this.resolveStreamInitPromise = resolve;
      this.rejectStreamInitPromise = reject;
    });

    this._loopPromise = this.createLoop().catch(() => {
      console.error('Failed to create loop');
      this.breakLoop = true;
    });

    return this.streamInitPromise;
  }

  async createLoop() {
    console.log(process.pid, 'createLoop → MAKE STREAM');
    const response = await fetch(`http://localhost:3030/stream`);

    if (!response.ok) {
      const error = new Error(`Failed to fetch stream`);
      this.rejectStreamInitPromise!(error);
      throw error;
    }

    if (!response.body) {
      const error = new Error(`No body found`);
      this.rejectStreamInitPromise!(error);
      throw error;
    }

    // Wait for the server to push some data
    for await (const chunk of streamAsyncIterable(response.body)) {
      if (this.breakLoop) break;
      const text = new TextDecoder().decode(chunk);
      const data = JSON.parse(text) as BundledDefinitions;
      this.definitions = data;
      // console.log(
      //   process.pid,
      //   'loop → update',
      //   JSON.stringify(
      //     data.definitions['proceed-to-checkout-color']?.environments
      //       .development,
      //     null,
      //     2,
      //   ),
      // );
      // only resolves once anyhow
      this.resolveStreamInitPromise!(data);
    }

    console.log(process.pid, 'loop → done');
  }

  // called once per flag rather than once per request,
  // but it's okay since we only ever read from memory here
  async getData() {
    if (!this.initialized) {
      console.log(process.pid, 'getData → init');
      await this.subscribe();
    }
    if (this.streamInitPromise) {
      console.log(process.pid, 'getData → await');
      await this.streamInitPromise;
    }
    if (this.definitions) {
      console.log(process.pid, 'getData → definitions');
      return this.definitions;
    }
    if (this.bundledDefinitions) {
      console.log(process.pid, 'getData → bundledDefinitions');
      return this.bundledDefinitions;
    }
    console.log(process.pid, 'getData → throw');
    throw new Error('No definitions found');
  }
}
