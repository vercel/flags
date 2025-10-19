import {
  ErrorCode,
  type EvaluationContext,
  type JsonValue,
  type Provider,
  type ProviderMetadata,
  ProviderStatus,
  type ResolutionDetails,
  type ResolutionReason,
  StandardResolutionReasons,
} from '@openfeature/server-sdk';
import { createClientFromConnectionString, Reason } from '.';
import type { FlagsClient } from './client';

function mapReason(reason: Reason): ResolutionReason {
  switch (reason) {
    case Reason.ERROR:
      return StandardResolutionReasons.ERROR;
    case Reason.PAUSED:
      return StandardResolutionReasons.STATIC;
    case Reason.FALLTHROUGH:
      return StandardResolutionReasons.DEFAULT;
    case Reason.TARGET_MATCH:
    case Reason.RULE_MATCH:
      return StandardResolutionReasons.TARGETING_MATCH;
    default:
      return StandardResolutionReasons.UNKNOWN;
  }
}

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
    await this.client.initialize();
  }

  async onClose() {
    await this.client.shutdown();
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

    if (result.reason === Reason.ERROR) {
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.GENERAL,
        errorMessage: result.errorMessage,
      };
    }

    if (typeof result.value !== 'boolean') {
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.TYPE_MISMATCH,
        errorMessage: `Expected boolean value for flag "${flagKey}"`,
      };
    }

    return {
      value: result.value,
      reason: mapReason(result.reason),
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

    if (result.reason === Reason.ERROR) {
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.GENERAL,
        errorMessage: result.errorMessage,
      };
    }

    if (typeof result.value !== 'string') {
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.TYPE_MISMATCH,
        errorMessage: `Expected string value for flag "${flagKey}"`,
      };
    }

    return {
      value: result.value,
      reason: mapReason(result.reason),
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

    if (result.reason === Reason.ERROR) {
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.GENERAL,
        errorMessage: result.errorMessage,
      };
    }

    if (typeof result.value !== 'number') {
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.TYPE_MISMATCH,
        errorMessage: `Expected number value for flag "${flagKey}"`,
      };
    }

    return {
      value: result.value,
      reason: mapReason(result.reason),
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

    if (result.reason === Reason.ERROR) {
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.GENERAL,
        errorMessage: result.errorMessage,
      };
    }

    return {
      value: result.value,
      reason: mapReason(result.reason),
      errorMessage: result.errorMessage,
    };
  }
}
