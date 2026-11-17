import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { FlagValuesType } from '../types';
import { FlagDefinitions, FlagValues } from '.';

function render(values: FlagValuesType | string) {
  return renderToStaticMarkup(createElement(FlagValues, { values }));
}

describe('FlagDefinitions', () => {
  it('is a function', () => {
    expect(typeof FlagDefinitions).toBe('function');
  });
});

describe('FlagValues', () => {
  it('renders the flag values', () => {
    expect(render({ banner: true })).toBe(
      '<script type="application/json" data-flag-values="true">{"banner":true}</script>',
    );
  });

  it('renders encrypted flag values', () => {
    expect(render('token')).toBe(
      '<script type="application/json" data-flag-values="true">"token"</script>',
    );
  });

  it('renders nothing for an empty string, which encryptFlagValues returns when the public key of Vercel does not load', () => {
    expect(render('')).toBe('');
  });

  it('renders flag values with no flags', () => {
    expect(render({})).toBe(
      '<script type="application/json" data-flag-values="true">{}</script>',
    );
  });
});
