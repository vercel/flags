import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluate, type Packed, Reason } from '@vercel/flags-core';
import { createScope, defineConnection, type RequestInputs } from 'flags';
import getEvaluationContext from './sources/site/context.ts';

function inputs(id: string): RequestInputs {
  return {
    headers: new Headers(),
    cookies: { get: () => ({ value: id }) },
  };
}

test('the source context works with normalized inputs outside Next.js', async () => {
  const definition: Packed.FlagDefinition = {
    seed: 1,
    variants: [false, true],
    environments: {
      development: {
        targets: [{}, { user: { id: ['alice'] } }],
        fallthrough: 0,
      },
    },
  };
  const connection = defineConnection({
    provider: {
      async evaluate(_key: string, context: { user: { id: string } }) {
        const result = evaluate<boolean>({
          definition,
          environment: 'development',
          entities: context,
        });
        assert.notEqual(result.reason, Reason.ERROR);
        return { value: result.value, catalogId: 'test' };
      },
    },
    getEvaluationContext,
  });
  assert.equal(
    await createScope(inputs('alice')).evaluate(
      connection,
      'enabled',
      [false, true],
      'test',
    ),
    true,
  );
  assert.equal(
    await createScope(inputs('bob')).evaluate(
      connection,
      'enabled',
      [false, true],
      'test',
    ),
    false,
  );
});
