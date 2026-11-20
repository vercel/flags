import { FlagsmithOpenFeatureProvider } from '@openfeature/flagsmith-provider';
import {
  defineSource,
  type EvaluationContext,
  type JsonValue,
  type Logger,
  type Provider,
} from 'flags';
import { Flagsmith } from 'flagsmith-nodejs';

/**
 * Creates the Flagsmith client and its OpenFeature provider on the first
 * evaluation.
 *
 * The provider needs a Flagsmith client. `new Flagsmith()` throws without
 * an environment key, and with local evaluation it starts to poll the
 * environment document at once. Tools import the `'use flags'` modules to
 * read the flags, e.g. the build when it writes the flags manifest, so the
 * client must not be created on import. The SDK initializes the provider
 * before the first evaluation.
 */
class LazyFlagsmithProvider implements Provider {
  readonly metadata = { name: 'flagsmith-provider' } as const;
  #client: Flagsmith | undefined;
  #provider: FlagsmithOpenFeatureProvider | undefined;

  #getProvider(): FlagsmithOpenFeatureProvider {
    if (!this.#provider) {
      this.#client = new Flagsmith({
        environmentKey: process.env.FLAGSMITH_ENVIRONMENT_KEY ?? '',
        // Downloads the environment document, and refreshes it every 60
        // seconds
        enableLocalEvaluation: true,
      });
      this.#provider = new FlagsmithOpenFeatureProvider(this.#client, {
        // Reads the value of boolean flags, like the coercion of v4,
        // instead of the enabled state
        useBooleanConfigValue: true,
      });
    }
    return this.#provider;
  }

  initialize(context?: EvaluationContext) {
    return this.#getProvider().initialize(context);
  }

  async onClose() {
    // Stops the polling of local evaluation
    await this.#client?.close();
  }

  resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
    logger: Logger,
  ) {
    return this.#getProvider().resolveBooleanEvaluation(
      flagKey,
      defaultValue,
      context,
      logger,
    );
  }

  resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext,
    logger: Logger,
  ) {
    return this.#getProvider().resolveStringEvaluation(
      flagKey,
      defaultValue,
      context,
      logger,
    );
  }

  resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext,
    logger: Logger,
  ) {
    return this.#getProvider().resolveNumberEvaluation(
      flagKey,
      defaultValue,
      context,
      logger,
    );
  }

  resolveObjectEvaluation<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    context: EvaluationContext,
    logger: Logger,
  ) {
    return this.#getProvider().resolveObjectEvaluation<T>(
      flagKey,
      defaultValue,
      context,
      logger,
    );
  }
}

// Without getEvaluationContext, the provider gets an empty evaluation
// context, and evaluates the flags of the environment. To target identities,
// return a `targetingKey` (the identifier of the identity) and `traits`.
export const flagsmith = defineSource({
  provider: new LazyFlagsmithProvider(),
});
