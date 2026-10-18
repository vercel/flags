/**
 * OpenFeature provider for Next.js App Router
 *
 * There is also openfeature.default.ts which targets default runtimes.
 * If you update this file, please update openfeature.default.ts as well.
 *
 * This file should stay equivalent to openfeature.default.ts, except that it
 * imports from index.next-js to get cached functions.
 */

import {
  ErrorCode,
  type EvaluationContext,
  type Hook,
  type JsonValue,
  type Provider,
  type ProviderMetadata,
  type ResolutionDetails,
  type ResolutionReason,
  StandardResolutionReasons,
} from '@openfeature/server-sdk';
import { internalReportValue } from './lib/report-value';
import { type FlagsClient, ResolutionReason as Reason } from './types';

/**
 * The reason of an override in the Flags SDK. The SDK resolves an override
 * without the provider, but runs the hooks of the provider.
 */
const OVERRIDE_REASON = 'OVERRIDE';

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

export function make(
  createClient: (sdkKeyOrConnectionString: string) => FlagsClient,
  defaultFlagsClient: FlagsClient,
) {
  return class VercelProvider implements Provider {
    readonly metadata: ProviderMetadata = {
      name: 'vercel-nodejs-provider',
    } as const;

    readonly runsOn = 'server';
    readonly client: FlagsClient;

    /**
     * Reports an override, as v4 of the Flags SDK did. The client reports
     * each other evaluation itself.
     */
    readonly hooks: Hook[] = [
      {
        after: (hookContext, details) => {
          if (details.reason !== OVERRIDE_REASON) return;
          internalReportValue(hookContext.flagKey, details.value, {
            originProvider: 'vercel',
            reason: 'override',
          });
          // Not awaited, so that the report does not delay the evaluation
          this.client
            .experimental_reportOverride?.({
              key: hookContext.flagKey,
              value: details.value,
              entities: hookContext.context,
            })
            .catch((error: unknown) => {
              console.error(
                '@vercel/flags-core: Failed to report flag override',
                error,
              );
            });
        },
      },
    ];

    constructor();
    constructor(client: FlagsClient);
    constructor(connectionString: string);
    constructor(
      clientOrConnectionString: FlagsClient | string = defaultFlagsClient,
    ) {
      if (typeof clientOrConnectionString === 'string') {
        this.client = createClient(clientOrConnectionString);
      } else {
        this.client = clientOrConnectionString;
      }
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
  };
}
