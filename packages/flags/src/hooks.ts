import { logger } from './logger';
import type {
  BeforeHookContext,
  EvaluationContext,
  EvaluationDetails,
  Hook,
  HookContext,
  HookData,
  HookFlagValue,
  HookHints,
  Provider,
} from './types';
import type { FlagType } from './value-types';

class MapHookData implements HookData {
  readonly #data = new Map<string, unknown>();

  set(key: string, value: unknown): void {
    this.#data.set(key, value);
  }

  get(key: string): unknown {
    return this.#data.get(key);
  }

  has(key: string): boolean {
    return this.#data.has(key);
  }

  delete(key: string): boolean {
    return this.#data.delete(key);
  }

  clear(): void {
    this.#data.clear();
  }
}

/**
 * The reason of an evaluation which returns an override.
 */
export const OVERRIDE_REASON = 'OVERRIDE';

/**
 * Runs the stages of the hooks of one evaluation, in the order of
 * OpenFeature: `before` from the first hook to the last, the other stages
 * from the last hook to the first. Each hook has its own `hookData`.
 *
 * @internal
 */
export class HookRun {
  readonly #hooks: readonly Hook[];
  readonly #data: HookData[];
  readonly #hints: HookHints | undefined;
  readonly #base: Omit<HookContext, 'context' | 'hookData'>;
  #context: EvaluationContext;

  constructor(options: {
    hooks: readonly Hook[];
    hints: HookHints | undefined;
    flagKey: string;
    defaultValue: HookFlagValue;
    type: FlagType;
    provider: Provider;
    context: EvaluationContext;
  }) {
    this.#hooks = options.hooks;
    this.#data = options.hooks.map(() => new MapHookData());
    this.#hints = options.hints;
    this.#context = options.context;
    const providerMetadata = options.provider.metadata;
    this.#base = {
      flagKey: options.flagKey,
      defaultValue: options.defaultValue,
      flagValueType: options.type,
      clientMetadata: {
        sdk: 'js-server',
        paradigm: 'server',
        providerMetadata,
      },
      providerMetadata,
      logger,
    };
  }

  /**
   * The evaluation context, with the contexts which `before` hooks returned.
   */
  get context(): EvaluationContext {
    return this.#context;
  }

  #hookContext(index: number): BeforeHookContext {
    return {
      ...this.#base,
      context: this.#context,
      hookData: this.#data[index] as HookData,
    };
  }

  /**
   * Runs `before`. A returned context is merged into a new object, so the
   * context of the request does not change.
   */
  async before(): Promise<void> {
    for (const [index, hook] of this.#hooks.entries()) {
      const result = await hook.before?.(this.#hookContext(index), this.#hints);
      if (result) this.#context = { ...this.#context, ...result };
    }
  }

  async after(details: EvaluationDetails<HookFlagValue>): Promise<void> {
    for (const index of this.#reversed()) {
      await this.#hooks[index]?.after?.(
        this.#hookContext(index),
        details,
        this.#hints,
      );
    }
  }

  /**
   * Runs `error`. An error of a hook is logged, not thrown.
   */
  async error(error: unknown): Promise<void> {
    for (const index of this.#reversed()) {
      try {
        await this.#hooks[index]?.error?.(
          this.#hookContext(index),
          error,
          this.#hints,
        );
      } catch (hookError) {
        logger.error('flags: An error hook failed.', hookError);
      }
    }
  }

  /**
   * Runs `finally`. An error of a hook is logged, not thrown.
   */
  async finally(details: EvaluationDetails<HookFlagValue>): Promise<void> {
    for (const index of this.#reversed()) {
      try {
        await this.#hooks[index]?.finally?.(
          this.#hookContext(index),
          details,
          this.#hints,
        );
      } catch (hookError) {
        logger.error('flags: A finally hook failed.', hookError);
      }
    }
  }

  *#reversed(): Generator<number> {
    for (let index = this.#hooks.length - 1; index >= 0; index--) yield index;
  }
}
