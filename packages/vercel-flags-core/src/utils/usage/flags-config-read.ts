import type { UsageEvent } from './events';

export interface TrackReadOptions {
  /** Whether the config was read from in-memory cache or embedded bundle */
  configOrigin: 'in-memory' | 'embedded';
  /** HIT when definitions exist in memory, MISS when not, BYPASS when using fallback as primary source */
  cacheStatus?: 'HIT' | 'MISS' | 'BYPASS';
  /** FOLLOWING when streaming, REFRESHING when polling, NONE otherwise */
  cacheAction?: 'REFRESHING' | 'FOLLOWING' | 'NONE';
  /** True for the very first getData call */
  cacheIsFirstRead?: boolean;
  /** Whether the cache read was blocking */
  cacheIsBlocking?: boolean;
  /** Duration in milliseconds from start of getData until trackRead */
  duration?: number;
  /** Timestamp when the config was last updated */
  configUpdatedAt?: number;
  /** The mode the SDK is operating in */
  mode?: 'poll' | 'stream' | 'build' | 'offline';
  /** Revision of the config */
  revision?: number;
}

export class FlagsConfigReadEvent implements UsageEvent {
  private readonly ts = Date.now();

  private payload: {
    deploymentId?: string;
    region?: string;
    invocationHost?: string;
    vercelRequestId?: string;
    cacheStatus?: 'HIT' | 'MISS' | 'BYPASS' | 'STALE';
    cacheAction?: 'REFRESHING' | 'FOLLOWING' | 'NONE';
    cacheIsBlocking?: boolean;
    cacheIsFirstRead?: boolean;
    duration?: number;
    configUpdatedAt?: number;
    configOrigin?: 'in-memory' | 'embedded' | 'poll' | 'stream' | 'constructor';
    mode?: 'poll' | 'stream' | 'build' | 'offline';
    revision?: string;
    environment?: string;
  };

  constructor(
    headers: Record<string, string> | undefined,
    options?: TrackReadOptions,
  ) {
    this.payload = {
      deploymentId: process.env.VERCEL_DEPLOYMENT_ID,
      region: process.env.VERCEL_REGION,
    };

    if (headers) {
      this.payload.vercelRequestId = headers['x-vercel-id'] ?? undefined;
      this.payload.invocationHost = headers.host ?? undefined;
    }

    if (options) {
      this.payload.configOrigin = options.configOrigin;
      if (options.cacheStatus !== undefined) {
        this.payload.cacheStatus = options.cacheStatus;
      }
      if (options.cacheAction !== undefined) {
        this.payload.cacheAction = options.cacheAction;
      }
      if (options.cacheIsFirstRead !== undefined) {
        this.payload.cacheIsFirstRead = options.cacheIsFirstRead;
      }
      if (options.cacheIsBlocking !== undefined) {
        this.payload.cacheIsBlocking = options.cacheIsBlocking;
      }
      if (options.duration !== undefined) {
        this.payload.duration = options.duration;
      }
      if (options.configUpdatedAt !== undefined) {
        this.payload.configUpdatedAt = options.configUpdatedAt;
      }
      if (options.mode !== undefined) {
        this.payload.mode = options.mode;
      }
      if (options.revision !== undefined) {
        this.payload.revision = String(options.revision);
      }
    }

    const environment =
      process.env.VERCEL_ENV || process.env.NODE_ENV || undefined;
    if (environment) {
      this.payload.environment = environment;
    }
  }

  ingestEvent() {
    return {
      type: 'FLAGS_CONFIG_READ' as const,
      ts: this.ts,
      payload: this.payload,
    };
  }
}
