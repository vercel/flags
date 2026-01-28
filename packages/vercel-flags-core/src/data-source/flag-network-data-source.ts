import { version } from '../../package.json';
import type { BundledDefinitions, DataSourceData } from '../types';
import type { DataSource, DataSourceMetadata } from './interface';

type Resolvers<T> = {
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
  promise: Promise<T>;
};

type Message =
  | { type: 'datafile'; data: BundledDefinitions }
  | { type: 'ping' };

function createResolvers<T>(): Resolvers<T> {
  let resolve: (value: T | PromiseLike<T>) => void;
  let reject: (reason?: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { resolve: resolve!, reject: reject!, promise };
}

async function fetchData(
  host: string,
  sdkKey: string,
): Promise<BundledDefinitions> {
  const res = await fetch(`${host}/v1/datafile`, {
    headers: {
      Authorization: `Bearer ${sdkKey}`,
      'User-Agent': `VercelFlagsCore/${version}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch data: ${res.statusText}`);
  }

  return res.json() as Promise<BundledDefinitions>;
}

type Loop = { start: () => Promise<void>; stop: () => void };

function createLoop(
  host: string,
  sdkKey: string,
  onMessage: (message: Message) => void,
  onError: (error: unknown) => void,
): Loop {
  let breakStreamMessageProcessing = false;
  let started = false;
  const start = async () => {
    if (started) throw new Error('can not start loop twice');
    started = true;
    while (!breakStreamMessageProcessing) {
      // Create a new AbortController for this connection attempt
      // this.abortController = new AbortController();
      try {
        console.log('start stream');

        const response = await fetch(`${host}/v1/stream`, {
          headers: {
            Authorization: `Bearer ${sdkKey}`,
            'User-Agent': `VercelFlagsCore/${version}`,
            // 'X-Retry-Attempt': String(this.retryCount),
          },
          // signal: this.abortController.signal,
        });
        console.log('got stream', response.ok);

        if (!response.ok) {
          throw new Error('stream was not ok');
        }

        if (!response.body) {
          throw new Error('stream body was not present');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        for await (const chunk of response.body) {
          if (breakStreamMessageProcessing) break;
          buffer += decoder.decode(chunk, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop()!; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line === '') continue;

            const message = JSON.parse(line) as Message;

            onMessage(message);
          }
        }
      } catch (error) {
        console.log('got error', error);
        onError(error);
      }
    }
  };

  return {
    start,
    stop: () => {
      breakStreamMessageProcessing = true;
    },
  };
}

type State =
  | 'uninitialized'
  | 'initializing'
  | 'initialize-aborted'
  | 'shutdown'
  | 'initialized';

/**
 * Implements the DataSource interface for flags.vercel.com.
 */
export class FlagNetworkDataSource implements DataSource {
  public sdkKey: string;
  readonly host = 'https://flags.vercel.com';
  private dataSourceData: DataSourceData | undefined = undefined;
  private initResolvers: Resolvers<void> | undefined = undefined;
  private state: State = 'uninitialized';
  private loop: Loop | undefined = undefined;
  private isBuildStep =
    process.env.CI === '1' ||
    process.env.NEXT_PHASE === 'phase-production-build';

  constructor(options: { sdkKey: string }) {
    if (
      !options.sdkKey ||
      typeof options.sdkKey !== 'string' ||
      !options.sdkKey.startsWith('vf_')
    ) {
      throw new Error(
        '@vercel/flags-core: SDK key must be a string starting with "vf_"',
      );
    }
    console.log('CREATED CLIENT', options.sdkKey);
    this.sdkKey = options.sdkKey;
  }

  async initialize(): Promise<void> {
    console.log(
      'client#initialize()',
      this.state,
      process.env.NEXT_PHASE,
      process.env.CI,
    );
    if (this.initResolvers?.promise && this.state !== 'initialize-aborted') {
      await this.initResolvers.promise;
      return;
    }

    this.state = 'initializing';
    this.initResolvers = createResolvers<void>();

    // don't stream during build step as the stream never closes,
    // so the build would hang indefinitely
    console.log('isBuildStep', this.isBuildStep);
    if (this.isBuildStep) {
      try {
        this.dataSourceData = await fetchData(this.host, this.sdkKey);
        this.initResolvers.resolve();
        this.state = 'initialized';
      } catch (error) {
        this.initResolvers.reject(error);
        this.state = 'initialize-aborted';
      }

      await this.initResolvers.promise;

      return;
    }

    try {
      this.loop = createLoop(
        this.host,
        this.sdkKey,
        this.onStreamMessage,
        this.onStreamError,
      );
      void this.loop.start().catch(this.onStreamError.bind(this));
      await this.initResolvers.promise;
      this.state = 'initialized';
    } catch (error) {
      console.log('catch', error);
      if (error instanceof Error && error.name === 'AbortError') {
        this.state = 'initialize-aborted';
        this.initResolvers.reject(error);
      } else {
        this.initResolvers.reject(error);
        throw error;
      }
    }
  }

  private onStreamMessage = (message: Message) => {
    console.log('onStreamMessage', message);
    if (message.type === 'datafile') {
      this.dataSourceData = message.data;
      this.initResolvers?.resolve();
    }
  };

  private onStreamError = (error: unknown) => {
    console.log('onStreamError', error);
    if (error instanceof Error && error?.name === 'AbortError') {
      console.log('Stream aborted, ignoring');
      this.loop?.stop();
    } else {
      console.error('Error processing stream:', error);
      this.initResolvers?.reject(error);
    }
  };

  async getData(): Promise<DataSourceData> {
    // await connection(); // mark as non-cacheable for Next.js
    await this.initialize();

    if (this.state === 'uninitialized') {
      throw new Error('client not yet initialized');
    }
    if (this.state === 'initialize-aborted') {
      throw new Error('client uninitialized');
    }
    if (!this.dataSourceData) {
      throw new Error('dataSourceData empty');
    }
    return this.dataSourceData;
  }

  async shutdown(): Promise<void> {
    // free up memory
    this.dataSourceData = undefined;
    this.loop?.stop();
    this.state = 'shutdown';
  }

  async getMetadata(): Promise<DataSourceMetadata> {
    const data =
      this.dataSourceData ?? (await fetchData(this.host, this.sdkKey));
    return { projectId: data.projectId };
  }

  /**
   * Runs a check to ensure the fallback definitions are available.
   */
  async ensureFallback(): Promise<void> {
    if (process.env.FLAGS_DEFINITIONS_STRATEGY === 'skip') return;

    try {
      await import('@vercel/flags-definitions/definitions.json');
    } catch {
      // ignore
    }
  }
}
