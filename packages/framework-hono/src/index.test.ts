import { runtime } from 'flags';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flags, rethrowSignal } from './index';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the Hono middleware', () => {
  it('runs each request in onInvoke', async () => {
    const onInvoke = vi.spyOn(runtime, 'onInvoke');
    const app = new Hono();
    app.use(flags());
    app.get('/', (c) => c.text('ok'));

    const response = await app.request('https://shop.example/');
    expect(await response.text()).toBe('ok');
    expect(onInvoke).toHaveBeenCalledOnce();
  });

  it('configures the SDK one time', () => {
    const configure = vi.spyOn(runtime, 'configure');
    const config = {};

    flags({ config });
    expect(configure).toHaveBeenCalledWith(config);
  });

  it('lets an HTTPException of Hono through', () => {
    const blocked = new HTTPException(403, { message: 'Blocked' });

    expect(() => rethrowSignal(blocked)).toThrow('Blocked');
    expect(() => rethrowSignal(new Error('Other'))).not.toThrow();
  });
});
