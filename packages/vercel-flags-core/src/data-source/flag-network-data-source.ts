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
  loopPromise: Promise<void>;
  breakLoop: boolean = false;
  resolveStreamInitPromise: undefined | ((value: BundledDefinitions) => void);
  rejectStreamInitPromise: undefined | ((reason?: any) => void);

  constructor(options: {
    sdkKey: string;
  }) {
    console.log('CONSTRUCTOR INIT');
    this.sdkKey = options.sdkKey;

    // preload from embedded json AND set up stream,
    // and only ever read from in-memory data
    this.bundledDefinitions = readBundledDefinitions(this.sdkKey);

    this.streamInitPromise = new Promise((resolve, reject) => {
      this.resolveStreamInitPromise = resolve;
      this.rejectStreamInitPromise = reject;
    });

    this.loopPromise = this.createLoop().catch(() => {
      console.error('Failed to create loop');
      this.breakLoop = true;
    });
  }

  async createLoop() {
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
      console.log(
        'updated to',
        JSON.stringify(
          data.definitions['proceed-to-checkout-color']?.environments
            .development,
          null,
          2,
        ),
      );
      // only resolves once anyhow
      this.resolveStreamInitPromise!(data);
    }

    console.log('Loop completed');
  }

  // called once per flag rather than once per request
  async getData() {
    await this.streamInitPromise;
    if (this.definitions) return this.definitions;
    if (this.bundledDefinitions) return this.bundledDefinitions;
    throw new Error('No definitions found');
  }
}
