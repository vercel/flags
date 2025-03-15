import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { getProviderData } from './index';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

const server = setupServer(
  http.get('https://api.devunus.com/api/flags', ({ request }) => {
    const authHeader = request.headers.get('Authorization');

    if (!authHeader || authHeader !== 'valid-key') {
      return new HttpResponse(null, { status: 401 });
    }

    return HttpResponse.json({
      flags: [
        {
          id: 'flag1',
          name: 'enableFeatureX',
          description: 'Enable feature X',
          value: true,
          type: 'boolean',
          createdAt: 1615000000000,
          updatedAt: 1620000000000,
        },
        {
          id: 'flag2',
          name: 'userTheme',
          description: 'User theme preference',
          value: 'dark',
          type: 'string',
          createdAt: 1615000000000,
          updatedAt: 1620000000000,
        },
      ],
      baseUrl: 'https://app.devunus.com/admin/333/project/1',
    });
  }),
);

describe('Devunus provider', () => {
  beforeAll(() => server.listen());
  afterAll(() => server.close());

  it('should return empty definitions and a hint when no env key is provided', async () => {
    const result = await getProviderData({ envKey: '' });

    expect(result.definitions).toEqual({});
    expect(result.hints).toBeDefined();
    expect(result.hints?.length).toBe(1);
    expect(result.hints?.[0]?.key).toBe('devunus/missing-env-key');
  });

  it('should return empty definitions and a hint when the API returns an error', async () => {
    const result = await getProviderData({ envKey: 'invalid-key' });

    expect(result.definitions).toEqual({});
    expect(result.hints).toBeDefined();
    expect(result.hints?.length).toBe(1);
    expect(result.hints?.[0]?.key).toBe('devunus/response-not-ok');
  });

  it('should return flag definitions when the API returns valid data', async () => {
    const result = await getProviderData({ envKey: 'valid-key' });

    expect(Object.keys(result.definitions)).toHaveLength(2);
    expect(result.definitions.enableFeatureX).toBeDefined();
    expect(result.definitions.userTheme).toBeDefined();
    const enableFeatureX = result.definitions.enableFeatureX;
    const userTheme = result.definitions.userTheme;
    expect(enableFeatureX?.description).toBe('Enable feature X');
    expect(userTheme?.description).toBe('User theme preference');
    expect(result.hints?.length).toBe(0);
  });
});
