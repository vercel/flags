import { expect, it, describe } from 'vitest';
import { getHypertuneData } from '.';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { HttpResponse, http } from 'msw';

const restHandlers = [
  http.get(
    `https://edge.hypertune.com/vercel-flag-definitions`,
    ({ request }) => {
      if (!request.headers.get('Authorization')) {
        return HttpResponse.json({}, { status: 401 });
      }

      return HttpResponse.json({
        'some-test-flag': {
          description: 'some-test-description',
          origin:
            'https://app.hypertune.com/projects/2645/draft?view=logic&selected_field_path=root%3EexampleFlag',
          options: [
            { value: false, label: 'Off' },
            { value: true, label: 'On' },
          ],
        },
      });
    },
  ),
];

const hypertuneToken = 'hypertune-token';
const server = setupServer(...restHandlers);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

describe('getHypertuneData', () => {
  describe('when called with valid params', () => {
    it('should fetch and return', async () => {
      await expect(
        getHypertuneData({ token: hypertuneToken }),
      ).resolves.toEqual({
        hints: [],
        definitions: {
          'some-test-flag': {
            description: 'some-test-description',
            options: [
              { label: 'Off', value: false },
              { label: 'On', value: true },
            ],
            origin:
              'https://app.hypertune.com/projects/2645/draft?view=logic&selected_field_path=root%3EexampleFlag',
          },
        },
      });
    });
  });

  describe('when called with invalid params', () => {
    it('should return appropriate hints', async () => {
      // @ts-expect-error this is the case we are testing
      await expect(getHypertuneData({})).resolves.toEqual({
        definitions: {},
        hints: [
          {
            key: 'hypertune/missing-token',
            text: 'Missing Hypertune token',
          },
        ],
      });
    });
  });
});
