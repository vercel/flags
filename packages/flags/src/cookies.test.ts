import { describe, expect, it } from 'vitest';
import { getCookies } from './cookies';
import type { ReadonlyRequestCookies } from './types';

function withCookieHeader(cookie: string) {
  return { headers: new Headers({ cookie }) };
}

describe('getCookies', () => {
  it('uses the cookies which the framework gives', () => {
    const cookies: ReadonlyRequestCookies = {
      get: () => ({ name: 'a', value: 'from-framework' }),
      getAll: () => [],
      has: () => true,
    };
    const request = {
      headers: new Headers({ cookie: 'a=from-header' }),
      cookies,
    };

    expect(getCookies(request)).toBe(cookies);
  });

  it('reads the Cookie header without cookies of the framework', () => {
    const cookies = getCookies(withCookieHeader('user=alice; theme=dark'));

    expect(cookies.get('user')).toEqual({ name: 'user', value: 'alice' });
    expect(cookies.has('theme')).toBe(true);
    expect(cookies.has('missing')).toBe(false);
    expect(cookies.get('missing')).toBeUndefined();
    expect(cookies.getAll()).toEqual([
      { name: 'user', value: 'alice' },
      { name: 'theme', value: 'dark' },
    ]);
  });

  it('decodes values and removes quotes', () => {
    const cookies = getCookies(
      withCookieHeader('name=J%C3%BCrg; quoted="a b"; broken=%E0%A4%A'),
    );

    expect(cookies.get('name')?.value).toBe('Jürg');
    expect(cookies.get('quoted')?.value).toBe('a b');
    expect(cookies.get('broken')?.value).toBe('%E0%A4%A');
  });

  it('keeps "=" in values', () => {
    expect(
      getCookies(withCookieHeader('token=a=b=c')).get('token')?.value,
    ).toBe('a=b=c');
  });

  it('uses the first cookie when a name occurs two times', () => {
    const cookies = getCookies(withCookieHeader('a=first; a=second'));

    expect(cookies.get('a')?.value).toBe('first');
    expect(cookies.getAll()).toHaveLength(2);
  });

  it('ignores parts without a name or without "="', () => {
    const cookies = getCookies(withCookieHeader('=value; flag; ok=1;'));

    expect(cookies.getAll()).toEqual([{ name: 'ok', value: '1' }]);
  });

  it('gives no cookies without a Cookie header', () => {
    expect(getCookies({ headers: new Headers() }).getAll()).toEqual([]);
  });

  it('reads the header once per headers object', () => {
    const headers = new Headers({ cookie: 'a=1' });

    expect(getCookies({ headers })).toBe(getCookies({ headers }));
  });

  it('does not change the result of getAll', () => {
    const cookies = getCookies(withCookieHeader('a=1'));
    cookies.getAll().pop();

    expect(cookies.getAll()).toHaveLength(1);
  });
});
