import { TypedInMemoryProvider } from '@openfeature/server-sdk';
import { decryptFlagValues, defineConnection, defineFlag } from 'flags';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FlagValues, type FlagValuesProps } from './flag-values';

// 32 bytes as base64url
const secret = 'dGhpcy1pcy1hLXRlc3Qtc2VjcmV0LWZvci1mbGFncyE';

const shop = defineConnection({
  provider: new TypedInMemoryProvider({
    'summer-sale': {
      variants: { on: true, off: false },
      defaultVariant: 'on',
      disabled: false,
    },
    banner: {
      variants: { sale: '</script>Sale' },
      defaultVariant: 'sale',
      disabled: false,
    },
  } as const),
  project: { system: 'in-memory' },
});
const summerSale = defineFlag(shop, 'summer-sale', false);
const banner = defineFlag(shop, 'banner', '');

/** Renders the component, as Next.js would: the async inner component. */
async function render(props: FlagValuesProps): Promise<string> {
  const suspense = FlagValues(props) as ReactElement<{
    children: ReactElement<FlagValuesProps>;
  }>;
  const inner = suspense.props.children;
  const element = await (
    inner.type as (props: FlagValuesProps) => Promise<ReactElement | null>
  )(inner.props);
  return element ? renderToStaticMarkup(element) : '';
}

function contentOf(html: string): unknown {
  const match = html.match(
    /^<script type="application\/json" data-flag-values="">(.*)<\/script>$/,
  );
  if (!match?.[1]) throw new Error(`not the element: ${html}`);
  return JSON.parse(match[1]);
}

beforeEach(() => {
  vi.stubEnv('FLAGS_SECRET', secret);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('FlagValues', () => {
  it('evaluates the flags and encrypts their values', async () => {
    const token = contentOf(await render({ flags: [summerSale, banner] }));

    expect(token).toBeTypeOf('string');
    await expect(decryptFlagValues(token as string)).resolves.toEqual({
      'summer-sale': true,
      banner: '</script>Sale',
    });
  });

  it('writes plain values only if the application selects them, and escapes them', async () => {
    const html = await render({ flags: [banner], plain: true });

    expect(html.match(/<\/script>/g)).toHaveLength(1);
    expect(contentOf(html)).toEqual({ banner: '</script>Sale' });
  });

  it('adds known values, which replace evaluated ones', async () => {
    const html = await render({
      flags: [summerSale],
      values: { 'summer-sale': false, checkout: 'express' },
      plain: true,
    });

    expect(contentOf(html)).toEqual({
      'summer-sale': false,
      checkout: 'express',
    });
  });

  it('writes no element if the values can not be encrypted, and warns one time', async () => {
    vi.stubEnv('FLAGS_SECRET', '');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 503 })),
    );
    const props = {
      flags: [summerSale],
      encryption: { jwksUrl: 'https://keys.example/jwks.json' },
    };

    await expect(render(props)).resolves.toBe('');
    await expect(render(props)).resolves.toBe('');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('status 503');
  });
});
