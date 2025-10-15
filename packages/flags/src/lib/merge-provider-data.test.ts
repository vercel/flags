import { describe, expect, it } from 'vitest';
import { mergeProviderData } from './merge-provider-data';

describe('mergeProviderData', async () => {
  it('returns empty providerData when called with an empty array', async () => {
    await expect(mergeProviderData([])).resolves.toEqual({
      definitions: {},
      hints: [],
    });
  });

  it('merges providerData from top to bottom', async () => {
    await expect(
      mergeProviderData([
        { definitions: { a: { description: 'desc1' } }, hints: [] },
        { definitions: { a: { description: 'desc2' } }, hints: [] },
      ]),
    ).resolves.toEqual({
      definitions: {
        a: { description: 'desc2' },
      },
      hints: [],
    });
  });

  it('merges providerData of different flags', async () => {
    await expect(
      mergeProviderData([
        { definitions: { a: { description: 'descA' } }, hints: [] },
        { definitions: { b: { description: 'descB' } }, hints: [] },
      ]),
    ).resolves.toEqual({
      definitions: {
        a: { description: 'descA' },
        b: { description: 'descB' },
      },
      hints: [],
    });
  });

  it('merges hints', async () => {
    await expect(
      mergeProviderData([
        {
          definitions: {},
          hints: [{ key: 'hintA', text: 'hintA' }],
        },
        {
          definitions: {},
          hints: [{ key: 'hintB', text: 'hintB' }],
        },
      ]),
    ).resolves.toEqual({
      definitions: {},
      hints: [
        { key: 'hintA', text: 'hintA' },
        { key: 'hintB', text: 'hintB' },
      ],
    });
  });

  it('merges complex cases', async () => {
    await expect(
      mergeProviderData([
        {
          definitions: {
            a: {
              description: 'descA',
              declaredInCode: true,
              options: [
                { label: 'nope', value: false },
                { label: 'nope', value: true },
              ],
            },
            b: { description: 'descB' },
          },
          hints: [{ key: 'hintA', text: 'hintA' }],
        },
        {
          definitions: {
            a: {
              options: [
                { label: 'Off', value: false },
                { label: 'On', value: true },
              ],
            },
          },
          hints: [],
        },
        {
          definitions: {
            c: { description: 'descC' },
          },
          hints: [],
        },
      ]),
    ).resolves.toEqual({
      definitions: {
        a: {
          description: 'descA',
          declaredInCode: true,
          options: [
            { label: 'Off', value: false },
            { label: 'On', value: true },
          ],
        },
        b: { description: 'descB' },
        c: { description: 'descC' },
      },
      hints: [{ key: 'hintA', text: 'hintA' }],
    });
  });

  it('ignores rejected promises', async () => {
    await expect(
      mergeProviderData([
        Promise.resolve({
          definitions: {},
          hints: [{ key: 'hintA', text: 'hintA' }],
        }),
        Promise.reject(new Error('error')),
        Promise.resolve({
          definitions: {},
          hints: [{ key: 'hintB', text: 'hintB' }],
        }),
      ]),
    ).resolves.toEqual({
      definitions: {},
      hints: [
        { key: 'hintA', text: 'hintA' },
        { key: 'hintB', text: 'hintB' },
      ],
    });
  });
});
