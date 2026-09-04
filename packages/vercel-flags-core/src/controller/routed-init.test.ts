import { afterEach, describe, expect, it } from 'vitest';
import { setRequestContext } from '../test-utils';
import { decideRoutedInit } from './routed-init';

const SYMBOL_FOR_REQ_CONTEXT = Symbol.for('@vercel/request-context');

/** Sets the routed config versions header on a fake request context. */
function setRoutedVersions(value: string): () => void {
  return setRequestContext({
    host: 'example.com',
    'x-vercel-edge-config-versions': value,
  });
}

describe('decideRoutedInit', () => {
  afterEach(() => {
    delete (globalThis as any)[SYMBOL_FOR_REQ_CONTEXT];
  });

  describe('no decision (preserves existing behavior)', () => {
    it('should not decide without a request context', () => {
      expect(
        decideRoutedInit({ projectId: 'prj_123', configUpdatedAt: 2000 }),
      ).toEqual({ immediate: false, outcome: undefined });
    });

    it('should not decide when the request context has no headers', () => {
      (globalThis as any)[SYMBOL_FOR_REQ_CONTEXT] = { get: () => ({}) };

      expect(
        decideRoutedInit({ projectId: 'prj_123', configUpdatedAt: 2000 }),
      ).toEqual({ immediate: false, outcome: undefined });
    });

    it('should not decide when the header is absent', () => {
      const cleanup = setRequestContext({ host: 'example.com' });

      expect(
        decideRoutedInit({ projectId: 'prj_123', configUpdatedAt: 2000 }),
      ).toEqual({ immediate: false, outcome: undefined });

      cleanup();
    });

    it('should not decide when the header is empty', () => {
      const cleanup = setRoutedVersions('');

      expect(
        decideRoutedInit({ projectId: 'prj_123', configUpdatedAt: 2000 }),
      ).toEqual({ immediate: false, outcome: undefined });

      cleanup();
    });

    it('should not decide when the project has no entry', () => {
      const cleanup = setRoutedVersions('ecfg_abc=3000;flags_prj_999=3000');

      expect(
        decideRoutedInit({ projectId: 'prj_123', configUpdatedAt: 2000 }),
      ).toEqual({ immediate: false, outcome: undefined });

      cleanup();
    });

    it.each([
      undefined,
      null,
      '',
      123,
    ])('should not decide without a usable project id (%p)', (projectId) => {
      const cleanup = setRoutedVersions('flags_prj_123=1000;flags_=1000');

      expect(decideRoutedInit({ projectId, configUpdatedAt: 2000 })).toEqual({
        immediate: false,
        outcome: undefined,
      });

      cleanup();
    });

    it('should not decide when reading the request context throws', () => {
      (globalThis as any)[SYMBOL_FOR_REQ_CONTEXT] = {
        get: () => {
          throw new Error('boom');
        },
      };

      expect(
        decideRoutedInit({ projectId: 'prj_123', configUpdatedAt: 2000 }),
      ).toEqual({ immediate: false, outcome: undefined });
    });
  });

  describe('comparison', () => {
    it('should initialize immediately when local data is newer', () => {
      const cleanup = setRoutedVersions('flags_prj_123=2000');

      expect(
        decideRoutedInit({ projectId: 'prj_123', configUpdatedAt: 2001 }),
      ).toEqual({ immediate: true, outcome: 'immediate' });

      cleanup();
    });

    it('should initialize immediately when local data is equal', () => {
      const cleanup = setRoutedVersions('flags_prj_123=2000');

      expect(
        decideRoutedInit({ projectId: 'prj_123', configUpdatedAt: 2000 }),
      ).toEqual({ immediate: true, outcome: 'immediate' });

      cleanup();
    });

    it('should accept a numeric string as local timestamp', () => {
      const cleanup = setRoutedVersions('flags_prj_123=2000');

      expect(
        decideRoutedInit({ projectId: 'prj_123', configUpdatedAt: ' 2000 ' }),
      ).toEqual({ immediate: true, outcome: 'immediate' });

      cleanup();
    });

    it('should wait when local data is behind', () => {
      const cleanup = setRoutedVersions('flags_prj_123=2001');

      expect(
        decideRoutedInit({ projectId: 'prj_123', configUpdatedAt: 2000 }),
      ).toEqual({ immediate: false, outcome: 'behind' });

      cleanup();
    });

    it('should only compare against the entry of the own project', () => {
      const cleanup = setRoutedVersions(
        'flags_prj_999=9999;flags_prj_123=2000;ecfg_abc=9999',
      );

      expect(
        decideRoutedInit({ projectId: 'prj_123', configUpdatedAt: 2000 }),
      ).toEqual({ immediate: true, outcome: 'immediate' });

      cleanup();
    });
  });

  describe('unsafe values', () => {
    it.each([
      '',
      'later',
      '-1',
      '1.5',
      '1e3',
      '9007199254740993',
    ])('should wait for a malformed routed version (%p)', (version) => {
      const cleanup = setRoutedVersions(`flags_prj_123=${version}`);

      expect(
        decideRoutedInit({ projectId: 'prj_123', configUpdatedAt: 2000 }),
      ).toEqual({ immediate: false, outcome: 'invalid' });

      cleanup();
    });

    it('should wait when the routed entry is duplicated', () => {
      const cleanup = setRoutedVersions(
        'flags_prj_123=1000;flags_prj_123=1000',
      );

      expect(
        decideRoutedInit({ projectId: 'prj_123', configUpdatedAt: 2000 }),
      ).toEqual({ immediate: false, outcome: 'duplicate' });

      cleanup();
    });

    it.each([
      undefined,
      null,
      'later',
      '',
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 2,
    ])('should wait for an unusable local timestamp (%p)', (configUpdatedAt) => {
      const cleanup = setRoutedVersions('flags_prj_123=1000');

      expect(
        decideRoutedInit({ projectId: 'prj_123', configUpdatedAt }),
      ).toEqual({ immediate: false, outcome: 'unknown-local' });

      cleanup();
    });
  });
});
