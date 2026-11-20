import { TypedInMemoryProvider } from '@openfeature/server-sdk';
import { defineFlag, defineSource } from 'flags';

// A source connects flags to an OpenFeature provider. Here it is an
// in-memory provider, so the demo needs no account. Any OpenFeature
// provider works the same way.
const provider = new TypedInMemoryProvider({
  'summer-sale': {
    variants: { on: true, off: false },
    defaultVariant: 'off',
    disabled: false,
    // On for alice only
    contextEvaluator: (context) => (context.user === 'alice' ? 'on' : 'off'),
  },
  'banner-text': {
    variants: { sale: 'Summer sale!', plain: 'Welcome' },
    defaultVariant: 'plain',
    disabled: false,
    contextEvaluator: (context) =>
      context.user === 'alice' ? 'sale' : 'plain',
  },
  'team-insights': {
    variants: { on: true, off: false },
    defaultVariant: 'off',
    disabled: false,
    // On for enterprise teams only
    contextEvaluator: (context) =>
      (context.team as { plan?: string } | undefined)?.plan === 'enterprise'
        ? 'on'
        : 'off',
  },
} as const);

// The source creates the evaluation context from the current request. It
// runs once per request, also when many flags use it.
export const shop = defineSource({
  provider,
  project: { system: 'in-memory' },
  getEvaluationContext: (
    request,
    input: { team?: { plan: string } } | undefined,
  ) => ({
    user: request?.cookies?.get('user')?.value ?? 'anonymous',
    ...(input?.team ? { team: input.team } : {}),
  }),
});

export const summerSale = shop.bindFlag('summer-sale');

export const bannerText = shop.bindFlag('banner-text', {
  type: 'string',
  defaultValue: 'Welcome',
});

// The context chain: the call side knows the team slug, the flag loads the
// team, and the source adds the user.
const teams: Record<string, { plan: string }> = {
  acme: { plan: 'enterprise' },
  tiny: { plan: 'hobby' },
};

export const teamInsights = shop.bindFlag('team-insights', {
  getEvaluationContext: (_request, context: { teamSlug: string }) => ({
    team: teams[context.teamSlug] ?? { plan: 'unknown' },
  }),
});

// An inline flag decides its value in the code, without a provider. It gets
// the context of the call side and the request.
export const betaBanner = defineFlag({
  key: 'beta-banner',
  decide: (request) => request?.cookies?.get('beta')?.value === '1',
  options: [false, true] as const,
});
