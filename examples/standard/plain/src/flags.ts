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
    input: { team?: { plan: string } } | undefined,
    request,
  ) => ({
    user: request?.cookies?.get('user')?.value ?? 'anonymous',
    ...(input?.team ? { team: input.team } : {}),
  }),
});

export const summerSale = defineFlag({ key: 'summer-sale', source: shop });

export const bannerText = defineFlag({
  key: 'banner-text',
  source: shop,
  type: 'string',
  defaultValue: 'Welcome',
});

// The context chain: the call side knows the team slug, the flag loads the
// team, and the source adds the user.
const teams: Record<string, { plan: string }> = {
  acme: { plan: 'enterprise' },
  tiny: { plan: 'hobby' },
};

export const teamInsights = defineFlag({
  key: 'team-insights',
  source: shop,
  getEvaluationContext: (context: { teamSlug: string }) => ({
    team: teams[context.teamSlug] ?? { plan: 'unknown' },
  }),
});
