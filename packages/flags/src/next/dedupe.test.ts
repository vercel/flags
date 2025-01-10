import { describe, expect, it, Mock, vitest, vi } from 'vitest';
import { dedupe } from './dedupe';

const mocks = vi.hoisted(() => {
  return {
    headers: vi.fn(async () => new Headers()),
    cookies: vi.fn(async () => ({
      get: vi.fn(),
    })),
  };
});

vi.mock('next/headers', async (importOriginal) => {
  const mod = await importOriginal<typeof import('next/headers')>();
  return {
    ...mod,
    // replace some exports
    headers: mocks.headers,
    cookies: mocks.cookies,
  };
});

async function getHeadersMock() {
  const headersMock = await import('next/headers').then((mod) => mod.headers);
  return headersMock as Mock;
}

describe('dedupe', () => {
  describe('no arguments', () => {
    it('should dedupe within same request', async () => {
      const fn = vitest.fn();
      const deduped = dedupe(fn);
      const same = new Headers();
      const headersMock = await getHeadersMock();
      headersMock.mockReturnValue(same);

      await deduped();
      await deduped();

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should not dedupe across requests', async () => {
      const fn = vitest.fn();
      const deduped = dedupe(fn);
      const same = new Headers();
      const different = new Headers();
      const headersMock = await getHeadersMock();
      headersMock.mockReturnValueOnce(same);
      await deduped();

      headersMock.mockReturnValueOnce(different);
      await deduped();

      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('multiple arguments', () => {
    it('should dedupe within same request', async () => {
      const fn = vitest.fn();
      const deduped = dedupe(fn);
      const same = new Headers();
      const headersMock = await getHeadersMock();
      headersMock.mockReturnValue(same);

      await deduped(1, 'a');
      await deduped(1, 'a');

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should not dedupe across requests', async () => {
      const fn = vitest.fn();
      const deduped = dedupe(fn);
      const same = new Headers();
      const different = new Headers();
      const headersMock = await getHeadersMock();
      headersMock.mockReturnValueOnce(same);
      await deduped(1, 'a');

      headersMock.mockReturnValueOnce(different);
      await deduped(1, 'b');

      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('primitive arguments', () => {
    it('should dedupe within same request when called with the same primitivearguments', async () => {
      const fn = vitest.fn();
      const deduped = dedupe(fn);
      const same = new Headers();
      const headersMock = await getHeadersMock();
      headersMock.mockReturnValue(same);

      await deduped(1);
      await deduped(1);

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should not dedupe within same request when called with different primitive arguments', async () => {
      const fn = vitest.fn();
      const deduped = dedupe(fn);
      const same = new Headers();
      const headersMock = await getHeadersMock();
      headersMock.mockReturnValue(same);

      await deduped(1);
      await deduped(2);

      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('object arguments', () => {
    it('should dedupe within same request when called with the same object references', async () => {
      const fn = vitest.fn();
      const deduped = dedupe(fn);
      const same = new Headers();
      const headersMock = await getHeadersMock();
      headersMock.mockReturnValue(same);

      const obj1 = { a: 1 };

      await deduped(obj1);
      await deduped(obj1);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should not dedupe within same request when called with different object references', async () => {
      const fn = vitest.fn();
      const deduped = dedupe(fn);
      const same = new Headers();
      const headersMock = await getHeadersMock();
      headersMock.mockReturnValue(same);

      await deduped({ a: 1 });
      await deduped({ a: 1 });
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('mutated object arguments', () => {
    it('should dedupe within same request when called with the same complex arguments', async () => {
      const fn = vitest.fn();
      const deduped = dedupe(fn);
      const same = new Headers();
      const headersMock = await getHeadersMock();
      headersMock.mockReturnValue(same);

      const obj1 = { a: 1 };

      // This is technically bad, but we check for referential equality only, we do not deep equal
      // for performance reasons.
      await deduped(obj1);
      obj1.a = 2;
      await deduped(obj1);
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('function arguments', () => {
    it('should dedupe within same request when called with the same fn arguments', async () => {
      const fn = vitest.fn();
      const deduped = dedupe(fn);
      const same = new Headers();
      const someFn = () => 1;
      const headersMock = await getHeadersMock();
      headersMock.mockReturnValue(same);

      await deduped(someFn);
      await deduped(someFn);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should not dedupe within same request when called with different fn arguments', async () => {
      const fn = vitest.fn();
      const deduped = dedupe(fn);
      const same = new Headers();
      const someFn = () => 1;
      const someOtherFn = () => 2;
      const headersMock = await getHeadersMock();
      headersMock.mockReturnValue(same);

      await deduped(someFn);
      await deduped(someOtherFn);
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('promises', () => {
    it('should dedupe even when the promise has not resolved yet', async () => {
      let resolvePromise: (value: unknown) => void = () => {
        throw new Error('resolvePromise not implemented');
      };

      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      const fn = vitest.fn(() => promise);
      const deduped = dedupe(fn);
      const same = new Headers();
      const headersMock = await getHeadersMock();
      headersMock.mockReturnValue(same);

      const result1Promise = deduped();
      const result2Promise = deduped();
      resolvePromise(1);
      await expect(deduped()).resolves.toBe(1);

      await expect(result1Promise).resolves.toBe(1);
      await expect(result2Promise).resolves.toBe(1);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should dedupe even when the promise has not rejected yet', async () => {
      let rejectPromise: (value: unknown) => void = () => {
        throw new Error('resolvePromise not implemented');
      };

      const headersMock = await getHeadersMock();

      const promise = new Promise((resolve, reject) => {
        rejectPromise = reject;
      });

      const fn = vitest.fn(() => promise);
      const deduped = dedupe(fn);
      const same = new Headers();
      headersMock.mockReturnValue(same);

      const result1Promise = expect(deduped()).rejects.toBe('artificial error');
      const result2Promise = expect(deduped()).rejects.toBe('artificial error');

      rejectPromise('artificial error');

      // prevent unhandled promise rejection
      await promise.catch(() => {});

      await expect(deduped()).rejects.toBe('artificial error');

      await Promise.allSettled([result1Promise, result2Promise]);

      expect(fn).toHaveBeenCalledTimes(1);
    });
  });
});
