import {
  type EvaluationContext,
  type JsonValue,
  type Provider,
  type ProviderMetadata,
  ProviderStatus,
  type ResolutionDetails,
} from '@openfeature/server-sdk';
import { createClientFromConnectionString } from '.';
import type { FlagsClient } from './client';

export class VercelProvider implements Provider {
  readonly metadata: ProviderMetadata = {
    name: 'vercel-nodejs-provider',
  } as const;

  readonly runsOn = 'server';
  private client: FlagsClient;

  /**
   * Creates a VercelProvider from an existing FlagsClient
   */
  constructor(client: FlagsClient);
  /**
   * Creates a VercelProvider from a connection string
   */
  constructor(connectionString: string);
  constructor(clientOrConnectionString: FlagsClient | string) {
    if (typeof clientOrConnectionString === 'string') {
      this.client = createClientFromConnectionString(clientOrConnectionString);
    } else {
      this.client = clientOrConnectionString;
    }
  }

  get status(): ProviderStatus {
    // TODO implement states
    if (!this.client) return ProviderStatus.NOT_READY;
    return ProviderStatus.READY;
  }

  async initialize(context?: EvaluationContext): Promise<void> {
    // wait until init
    // await this.client.initialize();
  }

  async onClose(): Promise<void> {
    // await this.client.close();
  }

  async resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<boolean>> {
    const result = await this.client.evaluate<boolean>(
      flagKey,
      defaultValue,
      context,
    );
    return {
      value: result.value ?? defaultValue,
      reason: result.reason,
      errorMessage: result.errorMessage,
    };
  }

  async resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<string>> {
    const result = await this.client.evaluate<string>(
      flagKey,
      defaultValue,
      context,
    );
    return {
      value: result.value ?? defaultValue,
      reason: result.reason,
      errorMessage: result.errorMessage,
    };
  }

  async resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<number>> {
    const result = await this.client.evaluate<number>(
      flagKey,
      defaultValue,
      context,
    );
    return {
      value: result.value ?? defaultValue,
      reason: result.reason,
      errorMessage: result.errorMessage,
    };
  }

  async resolveObjectEvaluation<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<T>> {
    const result = await this.client.evaluate<T>(
      flagKey,
      defaultValue,
      context,
    );
    return {
      value: result.value ?? defaultValue,
      reason: result.reason,
      errorMessage: result.errorMessage,
    };
  }
}
