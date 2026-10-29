import { isDeepStrictEqual } from 'node:util';
import type { Connection, RequestInputs } from './connection.ts';

/** An explicit scope also works in a request handler, job, or test. */
export function createScope(inputs: RequestInputs) {
  const contexts = new Map<object, Promise<unknown>>();
  const stats = { contextLoads: 0, evaluations: 0 };

  return {
    inputs,
    stats,
    async evaluate<Context, const Variants extends readonly unknown[]>(
      connection: Connection<Context>,
      key: string,
      variants: Variants,
      catalogId: string,
    ): Promise<Variants[number]> {
      let context = contexts.get(connection);
      if (!context) {
        stats.contextLoads += 1;
        context = Promise.resolve().then(() =>
          connection.getEvaluationContext(inputs),
        );
        contexts.set(connection, context);
      }

      stats.evaluations += 1;
      const result = await connection.provider.evaluate(
        key,
        (await context) as Context,
      );
      if (result.catalogId !== catalogId) {
        throw new Error(
          'The runtime project or environment differs from the generated catalog. Run pnpm flags:sync, then restart development or rebuild production.',
        );
      }
      if (
        !variants.some((variant) => isDeepStrictEqual(variant, result.value))
      ) {
        throw new Error(
          `Flag ${JSON.stringify(key)} returned a new variant. Run pnpm flags:sync, then restart development or rebuild production.`,
        );
      }

      return result.value as Variants[number];
    },
  };
}
