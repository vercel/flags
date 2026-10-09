import type * as OpenFeature from '@openfeature/server-sdk';
import { describe, expectTypeOf, it } from 'vitest';
import type {
  EvaluationContext,
  Logger,
  Provider,
  ProviderMetadata,
  ResolutionDetails,
} from './types';

// Our types are declared without importing @openfeature/* so customers don't
// depend on it. These checks make sure they stay compatible.
describe('OpenFeature compatibility', () => {
  it('accepts OpenFeature providers', () => {
    expectTypeOf<OpenFeature.Provider>().toExtend<Provider>();
    expectTypeOf<OpenFeature.ProviderMetadata>().toExtend<ProviderMetadata>();
  });

  it('accepts resolution details returned by OpenFeature providers', () => {
    expectTypeOf<OpenFeature.ResolutionDetails<boolean>>().toExtend<
      ResolutionDetails<boolean>
    >();
  });

  it('passes evaluation contexts OpenFeature providers accept', () => {
    expectTypeOf<EvaluationContext>().toExtend<OpenFeature.EvaluationContext>();
    expectTypeOf<OpenFeature.EvaluationContext>().toExtend<EvaluationContext>();
  });

  it('passes loggers OpenFeature providers accept', () => {
    expectTypeOf<Logger>().toExtend<OpenFeature.Logger>();
    expectTypeOf<OpenFeature.Logger>().toExtend<Logger>();
  });
});
