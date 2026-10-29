import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluate, type Packed, Reason } from '@vercel/flags-core';
import { defineConnection, type RequestInputs } from './connection.ts';
import { createScope } from './scope.ts';

function inputs(id: string): RequestInputs {
  return { headers: new Headers(), cookies: { get: () => ({ value: id }) } };
}

test('parallel flag calls resolve one context; separate requests stay isolated', async () => {
  const seen: string[] = [];
  const connection = defineConnection({
    provider: {
      async loadCatalog() {
        return { id: 'test', flags: {} };
      },
      async evaluate(_key: string, context: { id: string }) {
        seen.push(context.id);
        return { value: context.id, catalogId: 'test' };
      },
    },
    async getEvaluationContext({ cookies }) {
      await Promise.resolve();
      return { id: cookies.get('visitor')!.value };
    },
  });
  const first = createScope(inputs('alice'));
  const second = createScope(inputs('bob'));
  const result = await Promise.all([
    first.evaluate(connection, 'one', ['alice'], 'test'),
    first.evaluate(connection, 'two', ['alice'], 'test'),
    second.evaluate(connection, 'one', ['bob'], 'test'),
  ]);
  assert.deepEqual(result, ['alice', 'alice', 'bob']);
  assert.deepEqual(seen.sort(), ['alice', 'alice', 'bob']);
  assert.deepEqual(first.stats, { contextLoads: 1, evaluations: 2 });
  assert.equal(second.stats.contextLoads, 1);
});

test('a rejected context is shared within a request, then retried in the next', async () => {
  let attempts = 0;
  let evaluations = 0;
  const connection = defineConnection({
    provider: {
      async loadCatalog() {
        return { id: 'test', flags: {} };
      },
      async evaluate() {
        evaluations += 1;
        return { value: true, catalogId: 'test' };
      },
    },
    async getEvaluationContext() {
      attempts += 1;
      throw new Error('Context unavailable');
    },
  });
  const scope = createScope(inputs('alice'));
  const results = await Promise.allSettled([
    scope.evaluate(connection, 'one', [true], 'test'),
    scope.evaluate(connection, 'two', [true], 'test'),
  ]);
  assert.deepEqual(
    results.map((result) => result.status),
    ['rejected', 'rejected'],
  );
  assert.equal(attempts, 1);
  assert.equal(evaluations, 0);
  await assert.rejects(
    createScope(inputs('bob')).evaluate(connection, 'one', [true], 'test'),
  );
  assert.equal(attempts, 2);
});

test('context reaches the real core evaluator and affects targeting', async () => {
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
      async loadCatalog() {
        return { id: 'test', flags: { enabled: { variants: [false, true] } } };
      },
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
    getEvaluationContext({ cookies }) {
      return { user: { id: cookies.get('visitor')!.value } };
    },
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

test('catalog drift and a different runtime project cannot violate generated types', async () => {
  const connection = defineConnection({
    provider: {
      async loadCatalog() {
        return { id: 'test', flags: {} };
      },
      async evaluate() {
        return { value: { newVariant: true }, catalogId: 'test' };
      },
    },
    getEvaluationContext() {
      return {};
    },
  });
  const scope = createScope(inputs('alice'));
  await assert.rejects(
    scope.evaluate(connection, 'one', [true, false], 'test'),
    /new variant/,
  );
  await assert.rejects(
    scope.evaluate(connection, 'one', [{ newVariant: true }], 'other-project'),
    /project or environment/,
  );
  assert.deepEqual(
    await scope.evaluate(connection, 'one', [{ newVariant: true }], 'test'),
    { newVariant: true },
  );
});
